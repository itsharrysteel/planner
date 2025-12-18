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

/* --- DAILY PLANNING LOGIC --- */

let allTasks = []; // Store tasks locally to avoid re-fetching constantly

// 1. Fetch Tasks from DB
async function fetchTasks() {
    try {
        const res = await fetch('/api/tasks');
        allTasks = await res.json();
        renderTasks();
    } catch (err) {
        console.error("Error loading tasks:", err);
    }
}

// 2. Render Tasks to Screen
function renderTasks() {
    // Clear current lists
    document.getElementById('personal-task-list').innerHTML = '';
    document.querySelectorAll('.task-container').forEach(el => el.innerHTML = '');

    allTasks.forEach(task => {
        if (task.type === 'Personal') {
            // Render Personal List
            const html = `
                <div class="personal-task">
                    <input type="checkbox" ${task.status === 'Done' ? 'checked' : ''} onchange="updateTaskStatus(${task.id}, this.checked ? 'Done' : 'Todo')">
                    <span style="${task.status === 'Done' ? 'text-decoration:line-through; color:#aaa' : ''}">${task.title}</span>
                </div>`;
            document.getElementById('personal-task-list').insertAdjacentHTML('beforeend', html);
        } else {
            // Render Work Kanban
            const card = document.createElement('div');
            card.className = 'task-card';
            card.innerHTML = `<div>${task.title}</div><div class="task-meta">${task.due_date || 'No Date'}</div>`;
            
            // Add Simple Click-to-Move Logic (We can add drag-drop later)
            card.onclick = () => cycleStatus(task);
            
            // Find right column based on status (handling 'In Progress' vs 'In-Progress')
            let colId = '';
            if(task.status === 'Todo') colId = 'col-todo';
            else if(task.status === 'In-Progress') colId = 'col-inprogress';
            else if(task.status === 'On-Hold') colId = 'col-onhold';
            else if(task.status === 'Done') colId = 'col-done';

            if(colId) {
               document.querySelector(`#${colId} .task-container`).appendChild(card);
            }
        }
    });
}

// 3. Add New Task
function openAddTaskModal() {
    document.getElementById('task-modal').style.display = 'block';
}

async function saveNewTask() {
    const title = document.getElementById('new-task-title').value;
    const type = document.getElementById('new-task-type').value;
    
    if(!title) return;

    await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, type, due_date: '' })
    });

    document.getElementById('task-modal').style.display = 'none';
    document.getElementById('new-task-title').value = '';
    fetchTasks(); // Reload
}

// 4. Update Status (Checkbox or Kanban Move)
async function updateTaskStatus(id, newStatus) {
    await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
    });
    fetchTasks(); // Reload to update UI
}

// Simple Kanban Cycler (Click card to move to next stage)
async function cycleStatus(task) {
    const stages = ['Todo', 'In-Progress', 'On-Hold', 'Done'];
    let currentIdx = stages.indexOf(task.status);
    let nextStatus = stages[(currentIdx + 1) % stages.length];
    
    await updateTaskStatus(task.id, nextStatus);
}

// 5. Tab Switching
function switchDailyTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.daily-view').forEach(v => v.style.display = 'none');
    
    if(tab === 'personal') {
        document.querySelector('button[onclick="switchDailyTab(\'personal\')"]').classList.add('active');
        document.getElementById('view-personal').style.display = 'block';
    } else {
        document.querySelector('button[onclick="switchDailyTab(\'work\')"]').classList.add('active');
        document.getElementById('view-work').style.display = 'grid'; // Grid for Kanban
    }
}

// Load tasks when app starts
document.addEventListener('DOMContentLoaded', () => {
    fetchTasks();
});
