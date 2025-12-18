/* --- NAVIGATION --- */
function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.page-section');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            sections.forEach(section => {
                section.classList.remove('active');
                if (section.id === targetId) section.classList.add('active');
            });
            // Refresh Dashboard data on click
            if(targetId === 'dashboard') {
                fetchTasks().then(() => fetchBudget().then(loadDashboard));
            }
        });
    });
}

/* --- DASHBOARD LOGIC --- */
function loadDashboard() {
    // 1. Date & Greeting
    const date = new Date();
    const hrs = date.getHours();
    let greet = "Good Morning";
    if (hrs >= 12) greet = "Good Afternoon";
    if (hrs >= 17) greet = "Good Evening";
    
    document.getElementById('dash-greeting').innerText = greet + ", User";
    document.getElementById('dash-date').innerText = date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // 2. Task Stats
    const personalTodos = allTasks.filter(t => t.type === 'Personal' && t.status !== 'Done');
    const workTodos = allTasks.filter(t => t.type === 'Work' && t.status !== 'Done');
    
    document.getElementById('dash-task-count').innerText = personalTodos.length + workTodos.length;
    document.getElementById('dash-personal-count').innerText = personalTodos.length;
    document.getElementById('dash-work-count').innerText = workTodos.length;

    // 3. Render Top 3 Tasks
    const list = document.getElementById('dash-todo-list');
    list.innerHTML = '';
    const topTasks = [...personalTodos, ...workTodos].slice(0, 3);
    
    if (topTasks.length === 0) {
        list.innerHTML = '<li>No active tasks! Relax.</li>';
    } else {
        topTasks.forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${t.title}</span> <span style="font-size:0.7rem; background:#eee; padding:2px 5px; border-radius:4px;">${t.type}</span>`;
            list.appendChild(li);
        });
    }

    // 4. Money Stats
    const paybacks = allBudgetItems.filter(i => i.category === 'Payback');
    const totalDebt = paybacks.reduce((sum, item) => sum + (item.total_cost || 0), 0);
    document.getElementById('dash-debt-left').innerText = totalDebt.toFixed(2);

    // 5. Scratchpad Load
    const savedNote = localStorage.getItem('my_scratchpad');
    if (savedNote) {
        document.getElementById('dash-scratchpad').value = savedNote;
    }
}

document.getElementById('dash-scratchpad').addEventListener('input', (e) => {
    localStorage.setItem('my_scratchpad', e.target.value);
});

/* --- DAILY PLANNING LOGIC --- */
let allTasks = []; 

async function fetchTasks() {
    try {
        const res = await fetch('/api/tasks');
        allTasks = await res.json();
        
        // Ensure sorting
        allTasks.forEach(t => { if(!t.position_order) t.position_order = t.id; });
        allTasks.sort((a,b) => a.position_order - b.position_order);
        
        renderTasks();
    } catch (err) { console.error("Error loading tasks:", err); }
}

function renderTasks() {
    // 1. Reset Lists
    const personalList = document.getElementById('personal-task-list');
    personalList.innerHTML = '';
    
    const columns = {
        'Todo': document.querySelector('#col-todo .task-container'),
        'In-Progress': document.querySelector('#col-inprogress .task-container'),
        'On-Hold': document.querySelector('#col-onhold .task-container'),
        'Done': document.querySelector('#col-done .task-container')
    };
    Object.values(columns).forEach(col => col.innerHTML = '');

    const counts = { 'Todo': 0, 'In-Progress': 0, 'On-Hold': 0, 'Done': 0 };

    allTasks.forEach(task => {
        // --- PERSONAL LIST ---
        if (task.type === 'Personal') {
            const div = document.createElement('div');
            
            // Is it a Header or a Task?
            if (task.is_header) {
                div.className = 'personal-header';
                div.innerHTML = `
                    <span>${task.title}</span>
                    <button onclick="deleteTaskDirect(${task.id})" style="color:#999; border:none; background:none; cursor:pointer;">x</button>
                `;
            } else {
                div.className = 'personal-task';
                div.innerHTML = `
                    <span style="color:#ccc; cursor:grab; margin-right:10px;">☰</span>
                    <input type="checkbox" ${task.status === 'Done' ? 'checked' : ''} onchange="updateTaskStatusSimple(${task.id}, this.checked ? 'Done' : 'Todo')">
                    <span style="flex:1; margin-left:10px; cursor:pointer; ${task.status === 'Done' ? 'text-decoration:line-through; color:#aaa' : ''}" onclick="openTaskModalId(${task.id})">${task.title}</span>
                `;
            }
            
            // Enable Dragging for Personal Items
            div.draggable = true;
            div.dataset.id = task.id;
            addPersonalDragEvents(div);
            
            personalList.appendChild(div);
        } 
        // --- WORK KANBAN ---
        else {
            const statusKey = task.status || 'Todo';
            if (columns[statusKey]) {
                counts[statusKey]++; 
                
                let colorClass = `status-${statusKey.toLowerCase().replace('-','')}`;
                let dateBadge = '';
                
                if (task.due_date && statusKey !== 'Done') {
                    const today = new Date().setHours(0,0,0,0);
                    const due = new Date(task.due_date).setHours(0,0,0,0);
                    const diffDays = (due - today) / (1000 * 60 * 60 * 24);

                    if (diffDays < 0) { colorClass = 'urgent-overdue'; dateBadge = 'Overdue!'; }
                    else if (diffDays === 0) { colorClass = 'urgent-today'; dateBadge = 'Due Today'; }
                    else if (diffDays <= 3) { colorClass = 'urgent-soon'; dateBadge = 'Due Soon'; }
                }

                const card = document.createElement('div');
                card.className = `task-card ${colorClass}`;
                card.draggable = true;
                card.dataset.id = task.id;
                card.dataset.status = statusKey;
                
                card.innerHTML = `
                    <div style="font-weight:600;">${task.title}</div>
                    ${dateBadge ? `<span class="task-date-badge">${dateBadge}</span>` : ''}
                    ${task.due_date ? `<div class="task-meta">Due: ${task.due_date}</div>` : ''}
                `;

                card.onclick = () => openTaskModal(task); 
                addTaskDragEvents(card); 

                columns[statusKey].appendChild(card);
            }
        }
    });

    document.getElementById('count-todo').innerText = counts['Todo'];
    document.getElementById('count-inprogress').innerText = counts['In-Progress'];
    document.getElementById('count-onhold').innerText = counts['On-Hold'];
    document.getElementById('count-done').innerText = counts['Done'];
}

// --- PERSONAL DRAG & DROP ---
let personalDraggedId = null;

function addPersonalDragEvents(row) {
    row.addEventListener('dragstart', function(e) {
        personalDraggedId = this.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        this.classList.add('dragging');
    });
    
    row.addEventListener('dragover', function(e) { e.preventDefault(); });

    row.addEventListener('drop', async function(e) {
        e.preventDefault();
        this.classList.remove('dragging');
        
        const targetId = this.dataset.id;
        
        // Ensure we are swapping Personal items only
        if (personalDraggedId && targetId && personalDraggedId !== targetId) {
            // Optimistic Swap
            const itemA = allTasks.find(t => t.id == personalDraggedId);
            const itemB = allTasks.find(t => t.id == targetId);
            
            // If dragging between Personal and Work, stop.
            if (!itemA || !itemB || itemA.type !== 'Personal' || itemB.type !== 'Personal') return;

            const temp = itemA.position_order;
            itemA.position_order = itemB.position_order;
            itemB.position_order = temp;
            
            allTasks.sort((a,b) => a.position_order - b.position_order);
            renderTasks();

            await fetch('/api/tasks/update_order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: personalDraggedId, swap_with_id: targetId })
            });
        }
    });
    
    row.addEventListener('dragend', function() { this.classList.remove('dragging'); });
}

// --- WORK KANBAN DRAG & DROP ---
let taskDraggedId = null;
function addTaskDragEvents(card) {
    card.addEventListener('dragstart', function(e) {
        taskDraggedId = this.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        this.classList.add('dragging');
    });
    card.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        document.querySelectorAll('.task-container').forEach(c => c.style.background = '');
    });
}

document.querySelectorAll('.task-container').forEach(container => {
    container.addEventListener('dragover', e => { e.preventDefault(); container.style.background = '#f4f5f7'; });
    container.addEventListener('dragleave', e => { container.style.background = ''; });
    container.addEventListener('drop', async function(e) {
        e.preventDefault(); container.style.background = '';
        const newStatus = this.dataset.status; 
        const targetCard = e.target.closest('.task-card');
        
        if (targetCard && taskDraggedId && targetCard.dataset.id !== taskDraggedId) {
            const targetId = targetCard.dataset.id;
            const itemA = allTasks.find(t => t.id == taskDraggedId);
            const itemB = allTasks.find(t => t.id == targetId);
            
            const temp = itemA.position_order;
            itemA.position_order = itemB.position_order;
            itemB.position_order = temp;
            itemA.status = newStatus; 
            
            allTasks.sort((a,b) => a.position_order - b.position_order);
            renderTasks();

            await fetch('/api/tasks/update_order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: taskDraggedId, swap_with_id: targetId })
            });
        } else if (taskDraggedId) {
            const item = allTasks.find(t => t.id == taskDraggedId);
            if (item.status !== newStatus) {
                item.status = newStatus;
                item.position_order = Date.now(); 
                renderTasks();
                await fetch('/api/tasks/update_order', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id: taskDraggedId, new_status: newStatus })
                });
            }
        }
    });
});

// --- TASK MODAL LOGIC ---
function openAddTaskModal() { openTaskModal(null); }
function openTaskModalId(id) {
    const task = allTasks.find(t => t.id === id);
    if(task) openTaskModal(task);
}

function openTaskModal(task) {
    if (task) {
        document.getElementById('task-modal-title').innerText = "Edit Task";
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-type').value = task.type || 'Work';
        document.getElementById('task-status-select').value = task.status || 'Todo';
        document.getElementById('task-desc').value = task.description || '';
        document.getElementById('task-start').value = task.start_date || '';
        document.getElementById('task-due').value = task.due_date || '';
        document.getElementById('task-review').value = task.review_date || '';
        
        // Show delete button
        document.querySelector('.delete-btn').style.display = 'block';
    } else {
        document.getElementById('task-modal-title').innerText = "New Task";
        document.getElementById('task-id').value = '';
        document.getElementById('task-title').value = '';
        document.getElementById('task-type').value = 'Work';
        document.getElementById('task-status-select').value = 'Todo';
        document.getElementById('task-desc').value = '';
        document.getElementById('task-start').value = '';
        document.getElementById('task-due').value = '';
        document.getElementById('task-review').value = '';
        
        // Hide delete button for new tasks
        document.querySelector('.delete-btn').style.display = 'none';
    }
    document.getElementById('task-modal').style.display = 'block';
}

async function saveTask() {
    const id = document.getElementById('task-id').value;
    const title = document.getElementById('task-title').value;
    const type = document.getElementById('task-type').value;
    const status = document.getElementById('task-status-select').value;
    const desc = document.getElementById('task-desc').value;
    const start = document.getElementById('task-start').value;
    const due = document.getElementById('task-due').value;
    const review = document.getElementById('task-review').value;

    if (!title) return alert("Task title required");

    await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: id || null, 
            title, type, status, 
            description: desc, 
            start_date: start, 
            due_date: due, 
            review_date: review 
        })
    });

    document.getElementById('task-modal').style.display = 'none';
    fetchTasks();
}

async function deleteTask() {
    const id = document.getElementById('task-id').value;
    if(!id) return;
    if(!confirm("Delete this task?")) return;

    await fetch('/api/tasks/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    
    document.getElementById('task-modal').style.display = 'none';
    fetchTasks();
}

// Helper for Personal Headers
async function addPersonalSection() {
    const name = prompt("Enter section name (e.g. 'Morning', 'Errands'):");
    if(!name) return;
    
    await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            title: name, 
            type: 'Personal',
            is_header: 1 // Marks it as a section
        })
    });
    fetchTasks();
}

async function deleteTaskDirect(id) {
    if(!confirm("Delete this section header?")) return;
    await fetch('/api/tasks/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    fetchTasks();
}

async function updateTaskStatusSimple(id, newStatus) {
    const task = allTasks.find(t => t.id == id);
    if(task) task.status = newStatus;
    renderTasks();
    await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
    });
}

// --- TAB SWITCHING LOGIC ---
function switchDailyTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.daily-view').forEach(v => v.style.display = 'none');
    
    if(tab === 'personal') {
        const btn = document.getElementById('tab-personal');
        if(btn) btn.classList.add('active');
        document.getElementById('view-personal').style.display = 'block';
    } else {
        const btn = document.getElementById('tab-work');
        if(btn) btn.classList.add('active');
        document.getElementById('view-work').style.display = 'grid'; 
    }
}

// --- TASK DRAG & DROP ---
let taskDraggedId = null;

function addTaskDragEvents(card) {
    card.addEventListener('dragstart', function(e) {
        taskDraggedId = this.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        this.classList.add('dragging');
    });

    card.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        // Clean up visual cues
        document.querySelectorAll('.task-container').forEach(c => c.style.background = '');
    });
}

// Add listeners to COLUMNS (Containers) to handle drops
document.querySelectorAll('.task-container').forEach(container => {
    container.addEventListener('dragover', e => {
        e.preventDefault(); // Allow dropping
        container.style.background = '#f4f5f7'; // Highlight drop zone
    });
    
    container.addEventListener('dragleave', e => {
        container.style.background = '';
    });

    container.addEventListener('drop', async function(e) {
        e.preventDefault();
        container.style.background = '';
        
        const newStatus = this.dataset.status; // 'Todo', 'In-Progress' etc
        
        // Find if we dropped ONTO another card (Swap/Reorder)
        const targetCard = e.target.closest('.task-card');
        
        if (targetCard && taskDraggedId && targetCard.dataset.id !== taskDraggedId) {
            // SWAP LOGIC
            const targetId = targetCard.dataset.id;
            
            // Optimistic update
            const itemA = allTasks.find(t => t.id == taskDraggedId);
            const itemB = allTasks.find(t => t.id == targetId);
            
            // Swap orders
            const temp = itemA.position_order;
            itemA.position_order = itemB.position_order;
            itemB.position_order = temp;
            
            // Update status of dragged item to match target's column
            itemA.status = newStatus; 
            
            // Re-sort and Render
            allTasks.sort((a,b) => a.position_order - b.position_order);
            renderTasks();

            // API Call
            await fetch('/api/tasks/update_order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: taskDraggedId, swap_with_id: targetId })
            });

        } else if (taskDraggedId) {
            // DROP INTO EMPTY SPACE (Change Status, move to bottom)
            const item = allTasks.find(t => t.id == taskDraggedId);
            if (item.status !== newStatus) {
                item.status = newStatus;
                item.position_order = Date.now(); // Move to end of list
                
                renderTasks();

                await fetch('/api/tasks/update_order', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id: taskDraggedId, new_status: newStatus })
                });
            }
        }
    });
});

// --- TASK MODAL LOGIC ---
function openAddTaskModal() {
    openTaskModal(null); // Open empty
}

function openTaskModal(task) {
    if (task) {
        // Edit Mode
        document.getElementById('task-modal-title').innerText = "Edit Task";
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-type').value = task.type || 'Work';
        document.getElementById('task-status-select').value = task.status || 'Todo';
        document.getElementById('task-desc').value = task.description || '';
        document.getElementById('task-start').value = task.start_date || '';
        document.getElementById('task-due').value = task.due_date || '';
        document.getElementById('task-review').value = task.review_date || '';
    } else {
        // New Mode
        document.getElementById('task-modal-title').innerText = "New Task";
        document.getElementById('task-id').value = '';
        document.getElementById('task-title').value = '';
        document.getElementById('task-type').value = 'Work';
        document.getElementById('task-status-select').value = 'Todo';
        document.getElementById('task-desc').value = '';
        document.getElementById('task-start').value = '';
        document.getElementById('task-due').value = '';
        document.getElementById('task-review').value = '';
    }
    document.getElementById('task-modal').style.display = 'block';
}

async function saveTask() {
    const id = document.getElementById('task-id').value;
    const title = document.getElementById('task-title').value;
    const type = document.getElementById('task-type').value;
    const status = document.getElementById('task-status-select').value;
    const desc = document.getElementById('task-desc').value;
    const start = document.getElementById('task-start').value;
    const due = document.getElementById('task-due').value;
    const review = document.getElementById('task-review').value;

    if (!title) return alert("Task title required");

    await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: id || null, 
            title, type, status, 
            description: desc, 
            start_date: start, 
            due_date: due, 
            review_date: review 
        })
    });

    document.getElementById('task-modal').style.display = 'none';
    fetchTasks();
}

// Simple checkbox update for Personal list
async function updateTaskStatusSimple(id, newStatus) {
    const task = allTasks.find(t => t.id == id);
    if(task) task.status = newStatus;
    renderTasks();
    await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
    });
}

// --- TAB SWITCHING LOGIC ---
function switchDailyTab(tab) {
    // 1. Deactivate all tabs and hide all views
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.daily-view').forEach(v => v.style.display = 'none');
    
    if(tab === 'personal') {
        // 2. Activate Personal
        const btn = document.getElementById('tab-personal');
        if(btn) btn.classList.add('active');
        document.getElementById('view-personal').style.display = 'block';
    } else {
        // 3. Activate Work
        const btn = document.getElementById('tab-work');
        if(btn) btn.classList.add('active');
        document.getElementById('view-work').style.display = 'grid'; 
    }
}

/* --- GOALS LOGIC --- */
let allGoals = [];

async function fetchGoals() {
    try {
        const res = await fetch('/api/goals');
        allGoals = await res.json();
        renderGoals('Monthly', 'monthly-goals-container');
        renderGoals('Yearly', 'yearly-goals-container');
        renderGoals('Habit', 'habit-goals-container');
    } catch (err) { console.error("Error loading goals", err); }
}

function renderGoals(type, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const filtered = allGoals.filter(g => g.type === type);
    filtered.forEach(goal => {
        const percent = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100));
        const bgImage = goal.image_url ? `url('${goal.image_url}')` : 'none';
        const bgColor = goal.image_url ? 'transparent' : '#e0e0e0';

        const html = `
            <div class="goal-card">
                <div class="goal-image" style="background-image: ${bgImage}; background-color: ${bgColor}"></div>
                <div class="goal-content" onclick="editGoal(${goal.id})">
                    <div class="goal-title">${goal.title}</div>
                    <div class="progress-container"><div class="progress-fill" style="width: ${percent}%"></div></div>
                    <div class="goal-stats"><span>${percent}% Complete</span><span>${goal.current_amount} / ${goal.target_amount}</span></div>
                </div>
                <div class="goal-actions">
                    <button class="action-btn" onclick="quickUpdateGoal(${goal.id}, -1)">-</button>
                    <button class="action-btn" onclick="editGoal(${goal.id})" style="font-size:0.9rem">Details</button>
                    <button class="action-btn" onclick="quickUpdateGoal(${goal.id}, 1)">+</button>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function openGoalModal(type) {
    document.getElementById('goal-id').value = '';
    document.getElementById('goal-type').value = type;
    document.getElementById('goal-modal-title').innerText = `New ${type} Goal`;
    document.getElementById('goal-title-input').value = '';
    document.getElementById('goal-image-input').value = '';
    document.getElementById('goal-current-input').value = '0';
    document.getElementById('goal-target-input').value = '10';
    document.getElementById('goal-notes-input').value = '';
    document.getElementById('goal-modal').style.display = 'block';
}

function editGoal(id) {
    const goal = allGoals.find(g => g.id === id);
    if (!goal) return;
    document.getElementById('goal-id').value = goal.id;
    document.getElementById('goal-type').value = goal.type;
    document.getElementById('goal-modal-title').innerText = `Edit ${goal.type} Goal`;
    document.getElementById('goal-title-input').value = goal.title;
    document.getElementById('goal-image-input').value = goal.image_url || '';
    document.getElementById('goal-current-input').value = goal.current_amount;
    document.getElementById('goal-target-input').value = goal.target_amount;
    document.getElementById('goal-notes-input').value = goal.notes || '';
    document.getElementById('goal-modal').style.display = 'block';
}

async function saveGoal() {
    const id = document.getElementById('goal-id').value;
    const type = document.getElementById('goal-type').value;
    const title = document.getElementById('goal-title-input').value;
    const image_url = document.getElementById('goal-image-input').value;
    const current = parseInt(document.getElementById('goal-current-input').value) || 0;
    const target = parseInt(document.getElementById('goal-target-input').value) || 1;
    const notes = document.getElementById('goal-notes-input').value;

    if (!title) return alert("Title is required");

    const payload = { title, type, image_url, current_amount: current, target_amount: target, notes };
    let url = '/api/goals/add';
    if (id) {
        url = '/api/goals/update';
        payload.id = id;
    }
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    document.getElementById('goal-modal').style.display = 'none';
    fetchGoals();
}

async function quickUpdateGoal(id, change) {
    const goal = allGoals.find(g => g.id === id);
    if(!goal) return;
    const newAmount = Math.max(0, goal.current_amount + change);
    goal.current_amount = newAmount;

    // DYNAMIC CONTAINER SELECTION
    let containerId = 'monthly-goals-container';
    if (goal.type === 'Yearly') containerId = 'yearly-goals-container';
    if (goal.type === 'Habit') containerId = 'habit-goals-container';
    renderGoals(goal.type, containerId); 

    await fetch('/api/goals/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goal.id, current_amount: newAmount })
    });
}

/* --- BUDGET LOGIC --- */

let allBudgetItems = [];

async function fetchBudget() {
    try {
        const res = await fetch('/api/budget_items');
        allBudgetItems = await res.json();
        // Fix sorting
        allBudgetItems.forEach(i => { if(!i.position_order) i.position_order = i.id; });
        allBudgetItems.sort((a,b) => (a.position_order - b.position_order));

        renderBudget();
        checkPaydayReset();
    } catch (err) { console.error(err); }
}

function renderBudget() {
    const categories = ['Barclays', 'Monzo', 'Payback'];
    
    categories.forEach(cat => {
        const list = document.getElementById(`list-${cat.toLowerCase()}`);
        const totalSpan = document.getElementById(`total-${cat.toLowerCase()}`);
        if(!list) return;

        list.innerHTML = '';
        const items = allBudgetItems.filter(i => i.category === cat);
        let categoryRemaining = 0;

        items.forEach(item => {
            // Drag Drop Setup
            const tr = document.createElement('tr');
            tr.draggable = true;
            tr.dataset.id = item.id;
            tr.dataset.cat = cat;
            addBudgetDragEvents(tr);

            // --- TYPE: HEADER ---
            if (item.type === 'header') {
                tr.className = 'budget-header-row';
                // Colspan 7 ensures it spans across all columns (Name, Cost, Action etc)
                tr.innerHTML = `
                    <td style="cursor:grab; color:#ccc">☰</td>
                    <td colspan="5" class="editable-cell" onclick="editBudgetItem(${item.id})">${item.name}</td>
                    <td><button onclick="deleteBudgetItem(${item.id})" style="color:#999; border:none; background:none; cursor:pointer;">x</button></td>
                `;
                list.appendChild(tr);
                return; // Stop here for headers
            }

            // --- TYPE: BILL (Standard Logic) ---
            const isPaid = item.is_paid_this_month === 1;
            let displayMonthly = item.monthly_cost;
            let monthsDisplay = "-";

            if (cat === 'Payback') {
                if (item.final_payment_date) {
                    const now = new Date();
                    const due = new Date(item.final_payment_date);
                    const monthsDiff = (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth());
                    const monthsLeft = Math.max(1, monthsDiff); 
                    displayMonthly = item.total_cost / monthsLeft;
                    monthsDisplay = `${monthsLeft} mths`;
                }
                
                if (isPaid) categoryRemaining += (item.total_cost - displayMonthly);
                else categoryRemaining += item.total_cost;
            } else {
                if (!isPaid) categoryRemaining += item.monthly_cost;
            }

            tr.className = isPaid ? 'paid-row' : '';
            
            const nameCell = `<span class="editable-cell" onclick="editBudgetItem(${item.id})">${item.name}</span>`;

            if (cat === 'Payback') {
                const currentDebtDisplay = isPaid ? (item.total_cost - displayMonthly) : item.total_cost;
                tr.innerHTML = `
                    <td style="cursor:grab; color:#ccc">☰</td>
                    <td><input type="checkbox" ${isPaid ? 'checked' : ''} onchange="toggleBudgetPaid(${item.id}, this.checked)"></td>
                    <td>${nameCell}</td>
                    <td class="money-col">£${displayMonthly.toFixed(2)}</td>
                    <td class="money-col">£${currentDebtDisplay.toFixed(2)}</td>
                    <td style="font-size:0.8rem; color:#666;">${monthsDisplay}</td>
                    <td><button onclick="deleteBudgetItem(${item.id})" style="color:red; border:none; background:none; cursor:pointer;">x</button></td>
                `;
            } else {
                tr.innerHTML = `
                    <td style="cursor:grab; color:#ccc">☰</td>
                    <td><input type="checkbox" ${isPaid ? 'checked' : ''} onchange="toggleBudgetPaid(${item.id}, this.checked)"></td>
                    <td>${nameCell}</td>
                    <td class="money-col">£${item.monthly_cost.toFixed(2)}</td>
                    <td><button onclick="deleteBudgetItem(${item.id})" style="color:red; border:none; background:none; cursor:pointer;">x</button></td>
                `;
            }
            list.appendChild(tr);
        });

        totalSpan.innerText = categoryRemaining.toFixed(2);
    });
}

// --- MODAL & SAVING ---

function openBudgetModal(category, mode = 'bill') {
    // Reset Modal for New Entry
    document.getElementById('budget-id').value = ''; // Empty ID = New
    document.getElementById('budget-type').value = mode; 
    document.getElementById('budget-category').value = category;
    document.getElementById('budget-modal-title').innerText = mode === 'header' ? `Add Header to ${category}` : `Add Bill to ${category}`;
    
    document.getElementById('budget-name').value = '';
    document.getElementById('budget-monthly').value = '';
    document.getElementById('budget-total').value = '';
    document.getElementById('budget-date').value = '';
    
    // Hide cost fields if adding a Header
    const costFields = document.getElementById('cost-fields');
    costFields.style.display = mode === 'header' ? 'none' : 'block';

    // Show Payback fields only if Payback AND not header
    const paybackFields = document.getElementById('payback-fields');
    paybackFields.style.display = (category === 'Payback' && mode !== 'header') ? 'block' : 'none';
    
    document.getElementById('budget-modal').style.display = 'block';
}

function editBudgetItem(id) {
    const item = allBudgetItems.find(i => i.id === id);
    if (!item) return;

    // Populate Modal with existing data
    document.getElementById('budget-id').value = item.id;
    document.getElementById('budget-type').value = item.type;
    document.getElementById('budget-category').value = item.category;
    document.getElementById('budget-modal-title').innerText = `Edit ${item.name}`;
    
    document.getElementById('budget-name').value = item.name;
    document.getElementById('budget-monthly').value = item.monthly_cost;
    document.getElementById('budget-total').value = item.total_cost;
    document.getElementById('budget-date').value = item.final_payment_date || '';

    // Logic to show/hide fields based on what we are editing
    const costFields = document.getElementById('cost-fields');
    costFields.style.display = item.type === 'header' ? 'none' : 'block';

    const paybackFields = document.getElementById('payback-fields');
    paybackFields.style.display = (item.category === 'Payback' && item.type !== 'header') ? 'block' : 'none';

    document.getElementById('budget-modal').style.display = 'block';
}

async function saveBudgetItem() {
    const id = document.getElementById('budget-id').value;
    const type = document.getElementById('budget-type').value;
    const category = document.getElementById('budget-category').value;
    const name = document.getElementById('budget-name').value;
    const monthly = parseFloat(document.getElementById('budget-monthly').value) || 0;
    const total = parseFloat(document.getElementById('budget-total').value) || 0;
    const finalDate = document.getElementById('budget-date').value;

    if(!name) return;

    await fetch('/api/budget_items/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id, // If ID exists, API will update instead of insert
            category, name, type,
            monthly_cost: monthly, 
            total_cost: total,
            final_payment_date: finalDate 
        })
    });

    document.getElementById('budget-modal').style.display = 'none';
    fetchBudget();
}

// --- DRAG AND DROP (Budget Specific) ---
let budgetDraggedId = null;

function addBudgetDragEvents(row) {
    row.addEventListener('dragstart', function(e) {
        budgetDraggedId = this.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        this.style.opacity = '0.4';
    });
    
    row.addEventListener('dragover', function(e) {
        e.preventDefault(); // Allow drop
        e.dataTransfer.dropEffect = 'move';
    });

   row.addEventListener('drop', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        this.style.opacity = '1';
        
        const targetId = this.dataset.id;
        
        // Check if we are dropping on a valid row in the same category
        // We use a safe check here to ensure we don't crash if the dragged element isn't found
        const draggedRow = document.querySelector(`tr[data-id="${budgetDraggedId}"]`);
        
        if (budgetDraggedId && targetId && budgetDraggedId !== targetId && draggedRow && this.dataset.cat === draggedRow.dataset.cat) {
            
            // 1. Optimistic Swap (Update the internal numbers)
            const itemA = allBudgetItems.find(i => i.id == budgetDraggedId);
            const itemB = allBudgetItems.find(i => i.id == targetId);
            
            const temp = itemA.position_order;
            itemA.position_order = itemB.position_order;
            itemB.position_order = temp;
            
            // 2. CRITICAL FIX: Re-sort the array so the visual order updates
            allBudgetItems.sort((a,b) => (a.position_order - b.position_order));
            
            renderBudget();

            // 3. API Call to save the change
            await fetch('/api/budget_items/update_order', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: budgetDraggedId, swap_with_id: targetId })
            });
        }
    });
    
    row.addEventListener('dragend', function() {
        this.style.opacity = '1';
    });
}

// Standard Toggle/Delete...
async function toggleBudgetPaid(id, isPaid) {
    const item = allBudgetItems.find(i => i.id === id);
    if(item) item.is_paid_this_month = isPaid ? 1 : 0;
    renderBudget(); // Re-render to see immediate "Total Left" update for Paybacks
    await fetch('/api/budget_items/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_paid: isPaid })
    });
}

async function deleteBudgetItem(id) {
    if(!confirm("Delete this bill?")) return;
    await fetch('/api/budget_items/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    fetchBudget();
}

/* --- VISION BOARD LOGIC --- */
let allVisionItems = [];
let allCategories = [];
let currentVisionFilter = 'All';

async function initVisionBoard() {
    await fetchCategories();
    await fetchVision();
}

async function fetchCategories() {
    try {
        const res = await fetch('/api/categories');
        allCategories = await res.json();
        renderCategories();
    } catch(err) { console.error(err); }
}

function renderCategories() {
    const container = document.querySelector('.vision-filter');
    container.innerHTML = `<button class="filter-btn ${currentVisionFilter === 'All' ? 'active' : ''}" onclick="filterVision('All')">All</button>`;
    
    allCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${currentVisionFilter === cat.name ? 'active' : ''}`;
        btn.innerText = cat.name;
        btn.onclick = () => filterVision(cat.name);
        
        // ADDED: Tooltip helper
        btn.title = "Double-click to delete this category"; 
        
        btn.ondblclick = () => deleteCategory(cat.id, cat.name);
        container.appendChild(btn);
    });
    
    const addBtn = document.createElement('button');
    addBtn.className = 'add-cat-btn';
    addBtn.innerText = '+ New';
    addBtn.onclick = addNewCategory;
    container.appendChild(addBtn);

    const select = document.getElementById('vision-section');
    select.innerHTML = '';
    allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.innerText = cat.name;
        select.appendChild(opt);
    });
}

async function addNewCategory() {
    const name = prompt("Enter new category name:");
    if (!name) return;
    await fetch('/api/categories/add', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    });
    fetchCategories();
}

async function deleteCategory(id, name) {
    if(!confirm(`Delete category "${name}"?`)) return;
    await fetch('/api/categories/delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id })
    });
    if(currentVisionFilter === name) currentVisionFilter = 'All';
    fetchCategories();
}

async function fetchVision() {
    try {
        const res = await fetch('/api/vision_board');
        allVisionItems = await res.json();
        
        // AUTO-FIX: If any item has no order (null/0), default it to its ID
        allVisionItems.forEach(item => {
            if (!item.position_order) item.position_order = item.id;
        });

        // Sort by position_order
        allVisionItems.sort((a, b) => (a.position_order) - (b.position_order));
        renderVision();
    } catch (err) { console.error(err); }
}

function renderVision() {
    const grid = document.getElementById('vision-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const items = currentVisionFilter === 'All' ? allVisionItems : allVisionItems.filter(i => i.section === currentVisionFilter);

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'vision-card';
        card.draggable = true; 
        card.dataset.id = item.id; 

        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragenter', (e) => e.preventDefault());

        card.innerHTML = `
            <div class="vision-delete" onclick="deleteVisionItem(${item.id})">×</div>
            <img src="${item.image_url}" class="vision-img" onerror="this.src='https://via.placeholder.com/200?text=Err'">
            <div class="vision-overlay">
                <div class="vision-title" contenteditable="true" 
                     onblur="updateVisionTitle(${item.id}, this.innerText)" 
                     onkeypress="if(event.key==='Enter') this.blur();">
                     ${item.title}
                </div>
            </div>`;
        grid.appendChild(card);
    });
}

function filterVision(category) {
    currentVisionFilter = category;
    renderCategories();
    renderVision();
}

async function updateVisionTitle(id, newTitle) {
    const item = allVisionItems.find(i => i.id === id);
    if(item && item.title === newTitle) return;
    await fetch('/api/vision_board/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: newTitle, image_url: item.image_url })
    });
}

/* Drag and Drop Logic */
let draggedId = null;
function handleDragStart(e) { draggedId = this.dataset.id; this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; this.classList.add('drag-over'); }
function handleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    document.querySelectorAll('.vision-card').forEach(c => { c.classList.remove('dragging'); c.classList.remove('drag-over'); });
    const targetId = this.dataset.id;
    if (draggedId && targetId && draggedId !== targetId) swapItems(draggedId, targetId);
}

async function swapItems(idA, idB) {
    const idxA = allVisionItems.findIndex(i => i.id == idA);
    const idxB = allVisionItems.findIndex(i => i.id == idB);
    
    const tempOrder = allVisionItems[idxA].position_order;
    allVisionItems[idxA].position_order = allVisionItems[idxB].position_order;
    allVisionItems[idxB].position_order = tempOrder;

    allVisionItems.sort((a, b) => a.position_order - b.position_order);
    renderVision();

    await fetch('/api/vision_board/update', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id: idA, swap_with_id: idB })
    });
}

function openVisionModal() {
    document.getElementById('vision-title').value = '';
    document.getElementById('vision-url').value = '';
    document.getElementById('vision-modal').style.display = 'block';
}

async function saveVisionItem() {
    const title = document.getElementById('vision-title').value;
    const url = document.getElementById('vision-url').value;
    const section = document.getElementById('vision-section').value;

    if (!title || !url) return alert("Please enter a title and image URL");

    // FIX: Generate a huge number so it always goes to the end
    // (Wait a tiny bit to ensure uniqueness if clicking fast)
    const position_order = Date.now(); 

    // Optimistic Render (Add to UI immediately)
    const newItem = { 
        id: 'temp-' + Date.now(), 
        title, 
        image_url: url, 
        section, 
        position_order 
    };
    allVisionItems.push(newItem);
    renderVision();

    // Send to Backend (Note: we aren't sending position_order here because 
    // we haven't updated the API to accept it on INSERT, but the DB will default to 0. 
    // To fix this properly, let's rely on the DB ID or update the API.)
    
    // BETTER FIX: Let's just reload after save for now to get the real ID from DB
    await fetch('/api/vision_board/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, image_url: url, section })
    });

    document.getElementById('vision-modal').style.display = 'none';
    
    // Re-fetch to get the real ID and order from the database
    // (Run the SQL update logic on the backend if needed, but for now 
    // just re-fetching ensures we have valid IDs).
    fetchVision(); 
}

async function deleteVisionItem(id) {
    if(!confirm("Remove this vision?")) return;
    allVisionItems = allVisionItems.filter(i => i.id !== id);
    renderVision();
    await fetch('/api/vision_board/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
}

/* --- INIT --- */
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    fetchTasks();
    fetchGoals();
    fetchBudget();
    initVisionBoard(); 
    setTimeout(loadDashboard, 1000); 
});
