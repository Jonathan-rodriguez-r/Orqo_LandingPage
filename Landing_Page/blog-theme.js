const SUN_ICO = '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
const MOON_ICO = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-ico');
  if (icon) icon.innerHTML = theme === 'light' ? MOON_ICO : SUN_ICO;
  localStorage.setItem('orqo_theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem('orqo_theme') || 'dark');
  const button = document.getElementById('theme-toggle');
  if (button) button.addEventListener('click', toggleTheme);
});
