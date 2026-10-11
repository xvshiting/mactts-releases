# Agent 对话使用 MacTTS

MacTTS 0.4.0 提供音频输出流和合作式取消。每次请求仍需提交完整文本；不支持在同一个 HTTP 请求中逐 token 追加文本。Agent 可按句提交文本，或生成完一句再提交。尚未包含麦克风、VAD、ASR、LLM 或自动检测插话逻辑。

## 对话约定

- 一个对话使用固定 `channel`，每次生成使用新的 `request_id`（推荐 UUID）。
- 普通请求按登记顺序排队；不希望打断上一句时使用 `interrupt=false`。
- 用户插话时，调用 `POST /mactts/cancel`，立即停止 Agent 自己的播放器并清空缓冲。
- 新回复使用同一通道并设置 `interrupt=true`，取消该通道的旧生成、排队和播放；其他通道不受影响。
- 各通道共享一个模型，按顺序推理，通道用于隔离取消，不代表并行推理。
- 对话开始前可 `POST /mactts/wake` 预加载，避免首次冷加载等待。对话结束后可 `POST /mactts/sleep` 释放模型。

## 流式请求

```sh
curl -N http://127.0.0.1:8877/mactts/stream \
  -H 'Content-Type: application/json' \
  -d '{"input":"你好，现在可以开始对话。","voice":"Sofia","language":"zh","request_id":"turn-001","channel":"conversation-1","interrupt":true}'
```

也可以使用 `/v1/audio/speech`，增加 `"stream":true,"response_format":"pcm"`。请求体最大 1 MiB。最多 16 个生成/排队请求；队列已满返回 503。ID 限 1–128 字节的字母、数字、下划线、点、连字符。当前及最近完成的 ID 不可重复使用。省略 ID 时服务分配标识，可从 `X-MacTTS-Request-Id` 响应头获取。

响应为 `Content-Type: text/event-stream`，每个 SSE 记录是 `data: <JSON>\n\n`；类型在 JSON 的 `event` 字段中：

```text
data: {"event":"queued","request_id":"turn-001","message":""}

data: {"event":"started","request_id":"turn-001","sample_rate":22050,"channels":1,"format":"pcm_s16le"}

data: {"event":"audio","request_id":"turn-001","audio":"<base64 PCM>"}

data: {"event":"complete","request_id":"turn-001"}

```

收到 `started` 后按声明的采样率创建播放器；`audio` 是有符号 16 位小端单声道 PCM，解码 base64 后即可排入播放器。当前模型输出 22050 Hz。网络读取块与 SSE 记录边界不相同，解析器需要保留跨读取的残缺行/记录。

`complete` 表示生成成功；`cancelled` 表示取消；`error` 包含 `message`。HTTP 200 仅表示流已建立，必须看到 `complete` 才能把音频视为成功。断流、取消或错误时清空播放队列，不把部分音频发布成完整 WAV。取消可以发生在 `started` 之前。冷启动时模型加载本身可能继续，但已取消的请求不会进入推理。

外部客户端断开连接会在服务器下一次连接检查/音频回调时停止推理。为了更明确地停止长请求，先调用取消接口再关闭流。取消检查发生在生成块边界，并非保证在任意 GPU 指令中立即中止；模型保留在内存中供下一次回复使用。

## 取消与播放结束

```sh
curl http://127.0.0.1:8877/mactts/cancel \
  -H 'Content-Type: application/json' \
  -d '{"channel":"conversation-1"}'

# 或精确取消一个请求
curl http://127.0.0.1:8877/mactts/cancel \
  -H 'Content-Type: application/json' \
  -d '{"request_id":"turn-001"}'
```

返回 `cancelled_count` 和 `request_ids`。取消被接受后，活动流以 `cancelled` 结束；完整 WAV 请求返回 409。重复取消是安全的。`all=true` 用于全局取消，多个对话共享服务时应优先按通道或 ID 操作。

模型可能比播放速度更快，所以收到 `complete` 时播放器里仍可能有剩余音频。CLI、MCP 与原生应用的播放器会每 100 ms 查询 `/mactts/requests/<ID>`，发现 `cancelled=true` 后停止播放并清空已排入的缓冲。近期完成记录最多保留 1024 个；记录过期或服务断开时，原生播放器停止剩余播放。

Agent 自己的播放器也必须在插话/换轮时立即清空本地缓冲；只取消 HTTP 请求无法清除已经收到的 PCM。维护当前轮次 ID，丢弃旧 ID 的迟到音频块。可以复用请求状态接口同步来自其他客户端的取消。

## CLI / MCP / 应用

```sh
mactts speak "第一条回复。" --stream --play --channel conversation-1
mactts speak "新的一条回复。" --stream --play --channel conversation-1 --interrupt
mactts cancel --channel conversation-1
```

CLI 默认仍提供完整 WAV 模式，`--stream` 开启音频流，`--play` 开启本机播放。Ctrl-C / SIGTERM 取消当前生成、清空播放器并移除临时 WAV。仅完整生成且播放完成才发布请求的输出文件。

MCP `mactts_speak` 支持同名参数 `stream`、`play`、`interrupt`、`channel`、`request_id`；`mactts_cancel` 在旧工具等待时也能执行。MCP 的 JSON-RPC ID 与音频 `request_id` 是两个不同的标识：`notifications/cancelled.params.requestId` 指向 JSON-RPC ID，而 `mactts_cancel.request_id` 指向音频 ID。MCP 返回文件元数据；Agent 若要自己消费原始 PCM，应直接使用 HTTP 流式接口。

原生应用使用流式生成，启用「生成时自动播放（流式）」后边收边播，创作页提供「取消生成 / 播放」。界面使用 `studio` 通道。

## 安装与升级

下载公开 GitHub Release 的 DMG，把应用拖到 Applications，按 README 准备模型。升级前等待任务结束并退出旧版应用，然后替换应用包。如果 CLI 独立启动的旧服务仍在运行，请先结束该服务再启动新版。

应用内 CLI：`/Applications/MacTTS.app/Contents/MacOS/mactts-cli`。需要短命令时使用 DMG 中的安装脚本。
