document.addEventListener('DOMContentLoaded', () => {
    // --- Global Footer Injection ---
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
        fetch('/global/footer.html')
            .then(response => response.ok ? response.text() : Promise.reject('Footer not found.'))
            .then(data => { footerPlaceholder.innerHTML = data; })
            .catch(error => console.error('Error loading footer:', error));
    }
    
    // --- Global Header Injection & Mobile Menu Logic ---
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        fetch('/global/header.html')
            .then(response => response.ok ? response.text() : Promise.reject('Header not found.'))
            .then(data => {
                headerPlaceholder.innerHTML = data;
                
                // Once header is loaded, attach event listener for the menu button
                const btn = document.getElementById('menu-btn');
                const menu = document.getElementById('menu');

                btn.addEventListener('click', () => {
                    btn.classList.toggle('open');
                    menu.classList.toggle('hidden');
                    menu.classList.toggle('flex');
                });
            })
            .catch(error => console.error('Error loading header:', error));
    }
});
