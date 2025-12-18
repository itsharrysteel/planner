// Navigation Logic
function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.page-section');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1); // remove '#'
            
            // 1. Update Sidebar Active State
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // 2. Show Target Section, Hide Others
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetId) {
                    section.classList.add('active');
                }
            });
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    console.log("App Loaded");
});
