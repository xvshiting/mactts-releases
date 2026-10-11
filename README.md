# MacTTS 0.4.0 安装与模型指南

[产品页](https://xvshiting.github.io/mactts-releases/) · [Sites 产品页](https://mactts.early-flame-4706.chatgpt.site) · [下载 DMG](https://github.com/xvshiting/mactts-releases/releases/latest)

适用于 Apple Silicon（M 系列）Mac。构建最低系统版本为 macOS 14；目前实机验证在开发者当前系统完成，尚未逐一验证所有旧版本系统。Intel Mac 不支持此安装包。

## 1. 安装应用

从 https://github.com/xvshiting/mactts-releases/releases/latest 下载 `MacTTS-0.4.0-arm64.dmg`，打开后将 MacTTS.app 拖到 Applications（应用程序），再从应用程序启动。

这是早期测试版，使用 ad-hoc 签名，尚未经过 Apple 公证。若系统提示无法验证开发者，先尝试打开一次，然后在「系统设置 → 隐私与安全性」中找到 MacTTS，按系统提供的「仍要打开」流程操作。只针对你确认下载来源的 MacTTS 操作，无需关闭系统 Gatekeeper。官方说明：https://support.apple.com/zh-cn/102445 。如果提示文件损坏，先重新下载并校验 SHA-256；若仍失败，请提交系统版本、错误截图和日志。

可选校验：把 DMG 和 SHA256SUMS.txt 下载到同一文件夹，在终端切换到该文件夹后运行：

```sh
shasum -a 256 -c SHA256SUMS.txt
```

## 2. 下载模型

DMG 已包含引擎、中日文前端和依赖，不包含模型权重。不需要安装 Python、Node、Homebrew、CUDA 或 NeMo Python 包。

首次生成会自动从 Hugging Face 下载并校验模型。建议先打开「终端」，执行下面这条命令，以便看到完整下载进度：

```sh
"/Applications/MacTTS.app/Contents/Resources/runtime/bin/nemo-speech" pull magpie
```

也可运行 DMG 中的「下载模型.command」。下载完成后打开 MacTTS，输入文字、选择音色和语言，点击「生成语音」。设置中的「生成时自动播放（流式）」可边生成边播放。

一个 `pull magpie` 命令会准备以下全部资源，固定版本并校验 SHA-256：

| 资源 | 下载内容 | 大小 |
| --- | --- | --- |
| MagpieTTS v2607 | F16 GGUF 语音模型 | 约 542 MiB |
| 同版本 tokenizer | `.nemo` 中选定的分词/发音资源 | 下载约 30 MiB |
| NanoCodec | F16 GGUF 音频解码器 | 约 75 MiB |

必要下载合计约 647 MiB（约 679 MB），本机完整缓存约 637 MiB；临时文件与解压也需要空间，建议至少预留 2 GB。这是文件和安装空间说明，不是运行内存要求。

默认缓存：`~/Library/Caches/NeMoSpeech/models/`。所有资源准备完整后可离线生成。不必把 GGUF 拖进应用，也不要只下载一个 GGUF；语音模型、tokenizer 和音频解码器都需要。

模型与使用条款：

- MagpieTTS：https://huggingface.co/nvidia/magpie_tts_multilingual_357m
- NanoCodec：https://huggingface.co/nvidia/nemo-nano-codec-22khz-1.89kbps-21.5fps
- 两者按各自模型页的 NVIDIA Open Model License 使用；MacTTS 不重新分发模型权重。
- 引擎：https://github.com/NVIDIA/NeMo-Speech.cpp ，许可证和第三方声明保留在应用包内。

### 下载慢、失败或需要代理

确保网络可访问 Hugging Face。终端下载需要代理时，替换为自己的 HTTPS 代理地址和端口：

```sh
https_proxy="http://127.0.0.1:你的端口" \
  "/Applications/MacTTS.app/Contents/Resources/runtime/bin/nemo-speech" pull magpie
```

不要照抄「你的端口」。应用生成时会尝试读取系统 HTTPS 代理；上面的终端命令使用环境变量。失败后重新执行 `pull magpie`：完整文件会复用，当前文件支持断点续传。首次下载可能超过应用等待时间，因此先在终端准备模型更稳妥。

离线迁移：将已经完整下载的 `~/Library/Caches/NeMoSpeech/models/` 整个目录复制到另一台 Mac 的相同位置，保留仓库名、固定修订目录及其文件结构。不要混合不同模型版本的资源。

## 3. CLI 与 MCP（可选）

无需安装额外工具，可直接运行应用内 CLI：

```sh
"/Applications/MacTTS.app/Contents/MacOS/mactts-cli" speak "你好，世界。" --stream --play
```

DMG 中的「安装终端命令.command」会创建 `~/.local/bin/mactts` 链接，不覆盖其他已有命令，也不修改 shell 配置。在终端临时加入 PATH 后可以使用简写：

```sh
export PATH="$HOME/.local/bin:$PATH"
mactts speak "开始新的回复。" --stream --play --channel agent --interrupt
mactts cancel --channel agent
mactts clean --dry-run
```

需要永久启用时，可将 `export PATH="$HOME/.local/bin:$PATH"` 加入自己的 `~/.zshrc`。移动应用后应重新设置链接。

支持 stdio MCP 的客户端可配置：

```json
{
  "mcpServers": {
    "mactts": {
      "command": "/Applications/MacTTS.app/Contents/MacOS/mactts-cli",
      "args": ["mcp"]
    }
  }
}
```

MCP 支持 9 个工具：朗读、音色、状态、请求、取消、唤醒、休眠、设置、清理。首次模型加载要给客户端足够的超时。流式工具调用在本机播放，返回文件信息；原始 PCM 流通过 HTTP 获取。

## 4. Agent 与本地 API

默认服务仅监听 `http://127.0.0.1:8877`。生成自动启动/唤醒；默认空闲 5 分钟卸载模型。

```sh
curl -N http://127.0.0.1:8877/mactts/stream \
  -H 'Content-Type: application/json' \
  -d '{"input":"这是新的回复。","voice":"Sofia","language":"zh","channel":"agent","interrupt":true}'
```

此接口返回包含 Base64 PCM16 的 SSE 事件，不能直接作为 WAV 保存。完整协议见公开仓库的 `agent-tts.md`。流式指音频输出流式；每次请求仍需提供完整文字。接入 LLM 时先按句切分，再依次提交。同通道 `interrupt=true` 可取消旧生成、排队任务及仍在播放的旧音频。

## 5. 数据与卸载

- 历史、音频、服务日志：`~/Library/Application Support/MacTTS/`。
- 模型：`~/Library/Caches/NeMoSpeech/models/`。
- CLI/MCP 默认音频保留 7 天，在下次生成前清理；`clean --dry-run` 预览，`clean` 执行。显式导出文件与应用历史不受此清理影响。
- 卸载时退出应用，将 `/Applications/MacTTS.app` 移到废纸篓。模型与音频单独保留；确认不需要后在 Finder 中移到废纸篓。可一并移除自己安装的 `~/.local/bin/mactts` 链接。

## 反馈

公开安装包与问题反馈：https://github.com/xvshiting/mactts-releases 。反馈请附 Mac 芯片、macOS 版本、具体操作和错误信息；日志可能含本地路径或文本，分享前自行检查。
