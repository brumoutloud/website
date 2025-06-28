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

                if (btn && menu) { // Ensure elements exist after injection
                    btn.addEventListener('click', () => {
                        btn.classList.toggle('open');
                        menu.classList.toggle('hidden');
                        menu.classList.toggle('flex');

                        // Toggle icon for hamburger/X
                        const icon = btn.querySelector('i'); // Get the <i> element inside the button
                        if (icon) {
                            icon.classList.toggle('fa-bars');
                            icon.classList.toggle('fa-xmark'); // Use fa-xmark for a modern X icon
                        }
                    });
                }

                // Load Cookie Consent
                const cookieConsentCSS = document.createElement('link');
                cookieConsentCSS.rel = 'stylesheet';
                cookieConsentCSS.href = 'https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@v2.9.2/dist/cookieconsent.css';
                document.head.appendChild(cookieConsentCSS);

                const cookieConsentJS = document.createElement('script');
                cookieConsentJS.src = 'https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@v2.9.2/dist/cookieconsent.js';
                document.body.appendChild(cookieConsentJS);

                cookieConsentJS.onload = () => {
                    var cc = initCookieConsent();
                    cc.run({
                        current_lang: 'en',
                        autoclear_cookies: true,
                        page_scripts: true,
                        force_consent: true,

                        onFirstAction: function(user_preferences, cookie){
                            // callback triggered only once
                        },

                        onAccept: function (cookie) {
                            // ...
                        },

                        onChange: function (cookie, changed_preferences) {
                            // ...
                        },

                        gui_options: {
                            consent_modal: {
                                layout: 'box',
                                position: 'bottom right',
                                transition: 'slide',
                                swap_buttons: false
                            },
                            settings_modal: {
                                layout: 'box',
                                // position: 'left',
                                transition: 'slide'
                            }
                        },

                        languages: {
                            'en': {
                                consent_modal: {
                                    title: 'We use cookies',
                                    description: 'This website uses cookies to ensure you get the best experience on our website. <a href="/privacy-policy.html" class="cc-link">Learn more</a>',
                                    primary_btn: {
                                        text: 'Accept all',
                                        role: 'accept_all'
                                    },
                                    secondary_btn: {
                                        text: 'Reject all',
                                        role: 'accept_necessary'
                                    }
                                },
                                settings_modal: {
                                    title: 'Cookie preferences',
                                    save_settings_btn: 'Save settings',
                                    accept_all_btn: 'Accept all',
                                    reject_all_btn: 'Reject all',
                                    close_btn_label: 'Close',
                                    cookie_table_headers: [
                                        {col1: 'Name'},
                                        {col2: 'Domain'},
                                        {col3: 'Expiration'},
                                        {col4: 'Description'}
                                    ],
                                    blocks: [
                                        {
                                            title: 'Cookie usage 📢',
                                            description: 'I use cookies to ensure the basic functionalities of the website and to enhance your online experience. You can choose for each category to opt-in/out whenever you want. For more details relative to cookies and other sensitive data, please read the full <a href="/privacy-policy.html" class="cc-link">privacy policy</a>.'
                                        }, {
                                            title: 'Strictly necessary cookies',
                                            description: 'These cookies are essential for the proper functioning of my website. Without these cookies, the website would not work properly',
                                            toggle: {
                                                value: 'necessary',
                                                enabled: true,
                                                readonly: true
                                            }
                                        }, {
                                            title: 'Performance and Analytics cookies',
                                            description: 'These cookies allow the website to remember the choices you have made in the past',
                                            toggle: {
                                                value: 'analytics',
                                                enabled: false,
                                                readonly: false
                                            },
                                            cookie_table: [
                                                {
                                                    col1: '^_ga',
                                                    col2: 'google.com',
                                                    col3: '2 years',
                                                    col4: 'description ...',
                                                    is_regex: true
                                                },
                                                {
                                                    col1: '_gid',
                                                    col2: 'google.com',
                                                    col3: '1 day',
                                                    col4: 'description ...',
                                                }
                                            ]
                                        }, {
                                            title: 'Advertisement and Targeting cookies',
                                            description: 'These cookies collect information about how you use the website, which pages you visited and which links you clicked on. All of the data is anonymized and cannot be used to identify you',
                                            toggle: {
                                                value: 'targeting',
                                                enabled: false,
                                                readonly: false
                                            }
                                        }, {
                                            title: 'More information',
                                            description: 'For any queries in relation to our policy on cookies and your choices, please <a class="cc-link" href="/contact.html">contact us</a>.',
                                        }
                                    ]
                                }
                            }
                        }
                    });
                }
            })
            .catch(error => console.error('Error loading header:', error));
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        });
    }
});
