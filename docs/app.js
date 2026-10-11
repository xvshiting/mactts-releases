const tabs = [...document.querySelectorAll('[role="tab"]')];
function activate(tab) {
  for (const item of tabs) {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activate(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); activate(tabs[next]); tabs[next].focus(); }
  });
});
const announcement = document.getElementById('announcement');
document.querySelectorAll('[data-copy]').forEach(button => {
  let timer;
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy).textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = '已复制';
      announcement.textContent = '命令已复制到剪贴板';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.copy));
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      button.textContent = '请按 ⌘C';
      announcement.textContent = '内容已选中，请按 Command C 或 Control C 复制';
    }
    clearTimeout(timer); timer = setTimeout(() => { button.textContent = '复制'; }, 2500);
  });
});
document.querySelectorAll('audio').forEach(audio => audio.addEventListener('play', () => {
  document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); });
}));
