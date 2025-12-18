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
        renderTasks();
    } catch (err) { console.error("Error loading tasks:", err); }
}

function renderTasks() {
    document.getElementById('personal-task-list').innerHTML = '';
    document.querySelectorAll('.task-container').forEach(el => el.innerHTML = '');

    allTasks.forEach(task => {
        if (task.type === 'Personal') {
            const html = `
                <div class="personal-task">
                    <input type="checkbox" ${task.status === 'Done' ? 'checked' : ''} onchange="updateTaskStatus(${task.id}, this.checked ? 'Done' : 'Todo')">
                    <span style="${task.status === 'Done' ? 'text-decoration:line-through; color:#aaa' : ''}">${task.title}</span>
                </div>`;
            document.getElementById('personal-task-list').insertAdjacentHTML('beforeend', html);
        } else {
            const card = document.createElement('div');
            card.className = 'task-card';
            card.innerHTML = `<div>${task.title}</div><div class="task-meta">${task.due_date || 'No Date'}</div>`;
            card.onclick = () => cycleStatus(task);
            
            let colId = '';
            if(task.status === 'Todo') colId = 'col-todo';
            else if(task.status === 'In-Progress') colId = 'col-inprogress';
            else if(task.status === 'On-Hold') colId = 'col-onhold';
            else if(task.status === 'Done') colId = 'col-done';

            if(colId) document.querySelector(`#${colId} .task-container`).appendChild(card);
        }
    });
}

function openAddTaskModal() { document.getElementById('task-modal').style.display = 'block'; }

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
    fetchTasks(); 
}

async function updateTaskStatus(id, newStatus) {
    await fetch('/api/tasks/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
    });
    fetchTasks();
}

async function cycleStatus(task) {
    const stages = ['Todo', 'In-Progress', 'On-Hold', 'Done'];
    let currentIdx = stages.indexOf(task.status);
    let nextStatus = stages[(currentIdx + 1) % stages.length];
    await updateTaskStatus(task.id, nextStatus);
}

function switchDailyTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.daily-view').forEach(v => v.style.display = 'none');
    if(tab === 'personal') {
        document.querySelector('button[onclick="switchDailyTab(\'personal\')"]').classList.add('active');
        document.getElementById('view-personal').style.display = 'block';
    } else {
        document.querySelector('button[onclick="switchDailyTab(\'work\')"]').classList.add('active');
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
        renderBudget();
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
        let total = 0;

        items.forEach(item => {
            const isPaid = item.is_paid_this_month === 1;
            if (cat === 'Payback') total += (item.total_cost || 0); 
            else total += item.monthly_cost;

            const tr = document.createElement('tr');
            if(isPaid) tr.className = 'paid-row';

            if (cat === 'Payback') {
                tr.innerHTML = `
                    <td><input type="checkbox" ${isPaid ? 'checked' : ''} onchange="toggleBudgetPaid(${item.id}, this.checked)"></td>
                    <td>${item.name}</td>
                    <td class="money-col">£${item.monthly_cost}</td>
                    <td class="money-col">£${item.total_cost}</td>
                    <td><button onclick="deleteBudgetItem(${item.id})" style="color:red; border:none; background:none; cursor:pointer;">x</button></td>`;
            } else {
                tr.innerHTML = `
                    <td><input type="checkbox" ${isPaid ? 'checked' : ''} onchange="toggleBudgetPaid(${item.id}, this.checked)"></td>
                    <td>${item.name}</td>
                    <td class="money-col">£${item.monthly_cost}</td>
                    <td><button onclick="deleteBudgetItem(${item.id})" style="color:red; border:none; background:none; cursor:pointer;">x</button></td>`;
            }
            list.appendChild(tr);
        });
        totalSpan.innerText = total.toFixed(2);
    });
}

function openBudgetModal(category) {
    document.getElementById('budget-category').value = category;
    document.getElementById('budget-modal-title').innerText = `Add to ${category}`;
    document.getElementById('budget-name').value = '';
    document.getElementById('budget-monthly').value = '';
    document.getElementById('budget-total').value = '';
    document.getElementById('payback-fields').style.display = category === 'Payback' ? 'block' : 'none';
    document.getElementById('budget-modal').style.display = 'block';
}

async function saveBudgetItem() {
    const category = document.getElementById('budget-category').value;
    const name = document.getElementById('budget-name').value;
    const monthly = parseFloat(document.getElementById('budget-monthly').value) || 0;
    const total = parseFloat(document.getElementById('budget-total').value) || 0;
    if(!name) return;
    await fetch('/api/budget_items/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, name, monthly_cost: monthly, total_cost: total })
    });
    document.getElementById('budget-modal').style.display = 'none';
    fetchBudget();
}

async function toggleBudgetPaid(id, isPaid) {
    const item = allBudgetItems.find(i => i.id === id);
    if(item) item.is_paid_this_month = isPaid ? 1 : 0;
    renderBudget();
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
        allVisionItems.sort((a, b) => (a.position_order || 0) - (b.position_order || 0));
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
    await fetch('/api/vision_board/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, image_url: url, section })
    });
    document.getElementById('vision-modal').style.display = 'none';
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
