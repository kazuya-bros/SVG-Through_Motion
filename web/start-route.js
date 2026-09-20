// Hide unrelated startup screens until a direct destination is ready.
{const q=new URLSearchParams(location.search);if(['use','effects'].includes(q.get('menu'))||['project','prepared','runtime'].some(k=>/^[a-f0-9]{32}$/.test(q.get(k)||'')))document.documentElement.classList.add('route-loading');}
