(function () {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function apply(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }

  var saved = localStorage.getItem('theme');
  apply(saved === 'dark');

  btn.addEventListener('click', function () {
    var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    apply(dark);
  });
})();
