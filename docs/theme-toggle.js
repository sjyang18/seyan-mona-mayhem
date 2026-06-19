(function () {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
})();

function updateToggleIcon() {
  const btn = document.querySelector('.theme-toggle');
  if (!btn) {
    return;
  }
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  btn.innerHTML = isLight ? '🌙 Dark' : '☀️ Light';
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'light' ? 'dark' : 'light';
  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateToggleIcon();
}

document.addEventListener('DOMContentLoaded', () => {
  updateToggleIcon();
  const button = document.querySelector('.theme-toggle');
  if (button) {
    button.addEventListener('click', toggleTheme);
  }
});
