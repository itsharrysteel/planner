/* --- GLOBAL STATE --- */
let isSelectionMode = false;
let selectedTaskIds = new Set();

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
            if(targetId === 'dashboard') fetchTasks().then(() => fetchBudget().then(loadDashboard));
            
            // Exit selection mode if navigating away
            if(isSelectionMode) toggleSelectionMode();
            
            if (window.innerWidth <= 768) document.body.classList.remove('mobile-open');
        });
    });

    document.addEventListener('click', (e) => {
        const menu = document.getElementById('date-context-menu');
        if (menu && menu.style.display === 'block' && !e.target.closest('.personal-date-badge') && !e.target.closest('.date-input-fake') && !e.target.closest('.context-menu')) {
            menu.style.display = 'none';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });
}

function toggleSidebar() {
    if (window.innerWidth <= 768) document.body.classList.toggle('mobile-open');
    else document.body.classList.toggle('collapsed');
}

function closeAllModals() {
    const ids = ['task-modal', 'goal-modal', 'budget-modal', 'vision-modal', 'date-context-menu'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if(isSelectionMode) toggleSelectionMode();
}

/* --- DASHBOARD LOGIC --- */
function loadDashboard() {
    const date = new Date();
    const hrs = date.getHours();
    let greet = "Good Morning";
    if (hrs >= 12) greet = "Good Afternoon";
    if (hrs >= 17) greet = "Good Evening";
    
    const greetEl = document.getElementById('dash-greeting');
    const dateEl = document.getElementById('dash-date');
    if(greetEl) greetEl.innerText = greet + ", User";
    if(dateEl) dateEl.innerText = date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Only count Personal tasks now
    const personalTodos = allTasks.filter(t => t.type === 'Personal' && t.status !== 'Done');
    
    if(document.getElementById('dash-task-count')) document.getElementById('dash-task-count').innerText = personalTodos.length;

    const list = document.getElementById('dash-todo-list');
    if(list) {
        list.innerHTML = '';
        const topTasks = personalTodos.slice(0, 3);
        if (topTasks.length === 0) list.innerHTML = '<li>No active tasks! Relax.</li>';
        else {
            topTasks.forEach(t => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${t.title}</span>`;
                list.appendChild(li);
            });
        }
    }

    const paybacks = allBudgetItems.filter(i => i.category === 'Payback');
    const totalDebt = paybacks.reduce((sum, item) => sum + (item.total_cost || 0), 0);
    if(document.getElementById('dash-debt-left')) document.getElementById('dash-debt-left').innerText = totalDebt.toFixed(2);

    const savedNote = localStorage.getItem('my_scratchpad');
    const scratchEl = document.getElementById('dash-scratchpad');
    if (savedNote && scratchEl) scratchEl.value = savedNote;
}

const scratchpad = document.getElementById('dash-scratchpad');
if(scratchpad) {
    scratchpad.addEventListener('input', (e) => {
        localStorage.setItem('my_scratchpad', e.target.value);
    });
}

/* --- DAILY PLANNING LOGIC --- */
let allTasks = []; 

async function fetchTasks() {
    try {
        const res = await fetch('/api/tasks');
        allTasks = await res.json();
        allTasks.forEach(t => { if(!t.position_order) t.position_order = t.id; });
        allTasks.sort((a,b) => a.position_order - b.position_order);
        renderTasks();
    } catch (err) { console.error("Error loading tasks:", err); }
}

function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    selectedTaskIds.clear();
    
    document.body.classList.toggle('selection-mode', isSelectionMode);
    
    const btn = document.getElementById('btn-select-mode');
    if(btn) {
        btn.style.background = isSelectionMode ? 'var(--primary)' : 'white';
        btn.style.color = isSelectionMode ? 'white' : 'var(--primary)';
        btn.innerText = isSelectionMode ? 'Done' : 'Select';
    }
    
    updateBulkToolbar();
    renderTasks();
}

function handleTaskSelection(id) {
    if(!isSelectionMode) return;
    if(selectedTaskIds.has(id)) selectedTaskIds.delete(id);
    else selectedTaskIds.add(id);
    renderTasks();
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const toolbar = document.getElementById('bulk-toolbar');
    const countSpan = document.getElementById('bulk-count');
    if(!toolbar) return;
    
    if(isSelectionMode && selectedTaskIds.size > 0) {
        toolbar.classList.add('active');
        countSpan.innerText = selectedTaskIds.size;
    } else {
        toolbar.classList.remove('active');
    }
}

async function bulkActionDelete() {
    if(!confirm(`Delete ${selectedTaskIds.size} tasks?`)) return;
    const ids = Array.from(selectedTaskIds);
    await fetch('/api/tasks/batch_delete', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ ids })
    });
    toggleSelectionMode();
    fetchTasks();
}

async function bulkActionDate() {
    activeDateTaskId = 'batch';
    openDateMenu({ currentTarget: document.querySelector('.bulk-btn') }, 'batch');
}

async function bulkActionMove() {
    const headers = allTasks.filter(t => t.type === 'Personal' && t.is_header);
    let msg = "Move selected tasks to:\n\n[T] Top of List\n";
    headers.forEach((h, i) => msg += `[${i+1}] ${h.title}\n`);
    
    const choice = prompt(msg);
    if(!choice) return;
    
    let updates = { type: 'Personal' };
    
    if(choice.toLowerCase() === 't') {
        updates.position_order = Date.now();
    } else {
        const index = parseInt(choice) - 1;
        if (headers[index]) {
            updates.position_order = (headers[index].position_order || 0) + 1;
        } else {
            return;
        }
    }
    
    const ids = Array.from(selectedTaskIds);
    await fetch('/api/tasks/batch_update', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ ids, updates })
    });
    toggleSelectionMode();
    fetchTasks();
}


function renderTasks() {
    const personalList = document.getElementById('personal-task-list');
    if(!personalList) return;
    personalList.innerHTML = '';

    allTasks.forEach(task => {
        // Only render Personal items now
        if (task.type !== 'Personal') return;

        const isSelected = selectedTaskIds.has(task.id);
        const selectedClass = isSelected ? 'task-selected' : '';

        const div = document.createElement('div');
        
        if (task.is_header) {
            div.className = `personal-header`;
            div.innerHTML = `
                <span>${task.title}</span>
                ${!isSelectionMode ? `<button onclick="deleteTaskDirect(${task.id})" style="color:#999; border:none; background:none; cursor:pointer;">x</button>` : ''}
            `;
        } else {
            div.className = `personal-task ${selectedClass}`;
            if(isSelectionMode) div.setAttribute('onclick', `handleTaskSelection(${task.id})`);
            
            // Format Date
            let dateDisplay = "Add Date";
            let dateClass = "";
            if (task.due_date) {
                const today = new Date(); today.setHours(0,0,0,0);
                const due = new Date(task.due_date); due.setHours(0,0,0,0);
                const diff = (due - today) / (1000 * 60 * 60 * 24);
                if (diff < 0) { dateDisplay = `Overdue ${task.due_date}`; dateClass = "overdue"; }
                else if (diff === 0) { dateDisplay = "Today"; dateClass = "today"; }
                else if (diff === 1) { dateDisplay = "Tomorrow"; }
                else { dateDisplay = due.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); }
            }

            const dragHandle = isSelectionMode ? 
                `<div class="select-indicator"></div>` : 
                `<span style="color:#ccc; cursor:grab; margin-right:8px;">☰</span>
                 <input type="checkbox" ${task.status === 'Done' ? 'checked' : ''} onchange="updateTaskStatusSimple(${task.id}, this.checked ? 'Done' : 'Todo')">`;

            const titleAction = isSelectionMode ? '' : `onclick="openTaskModalId(${task.id})"`;
            const dateAction = isSelectionMode ? '' : `onclick="openDateMenu(event, ${task.id})"`;

            div.innerHTML = `
                <div style="padding-top:2px; display:flex; align-items:center;">
                    ${dragHandle}
                </div>
                <div class="personal-task-content">
                    <span class="personal-task-title ${task.status === 'Done' ? 'done-text' : ''}" 
                          style="${task.status === 'Done' ? 'text-decoration:line-through; color:#aaa' : ''}" 
                          ${titleAction}>
                          ${task.title}
                    </span>
                    <span class="personal-date-badge ${dateClass}" ${dateAction}>
                       ${task.due_date ? '📅 ' + dateDisplay : '➕ Add Date'}
                    </span>
                </div>
            `;
        }
        
        if(!isSelectionMode) {
            div.draggable = true;
            div.dataset.id = task.id;
            addPersonalDragEvents(div);
        }
        personalList.appendChild(div);
    });
}

/* --- NATURAL LANGUAGE DATE PARSER --- */
let suggestedDate = null;
let suggestedPhrase = "";

function checkDateIntent(text) {
    const suggestionEl = document.getElementById('date-suggestion');
    suggestedDate = null;
    suggestedPhrase = "";
    if (!text) { suggestionEl.style.display = 'none'; return; }

    const lower = text.toLowerCase();
    const today = new Date();
    let targetDate = null;
    let phrase = "";

    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    if (/\b(today)\b/.test(lower)) { targetDate = new Date(); phrase = "today"; }
    else if (/\b(tomorrow)\b/.test(lower)) { targetDate = new Date(); targetDate.setDate(today.getDate() + 1); phrase = "tomorrow"; }
    else if (/\b(next week)\b/.test(lower)) { targetDate = new Date(); targetDate.setDate(today.getDate() + (1 + 7 - today.getDay()) % 7 || 7); phrase = "next week"; }
    else if (lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\b/)) {
        const match = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\b/);
        const day = parseInt(match[1]);
        const monthStr = match[2];
        let monthIndex = months.indexOf(monthStr.substring(0,3));
        if (monthIndex > -1 && day >= 1 && day <= 31) {
            targetDate = new Date(); targetDate.setMonth(monthIndex); targetDate.setDate(day);
            if (targetDate < new Date(new Date().setHours(0,0,0,0))) targetDate.setFullYear(today.getFullYear() + 1);
            phrase = match[0];
        }
    }
    else if (lower.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)) {
        const match = lower.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
        const dayName = match[1];
        const targetDay = days.indexOf(dayName);
        const currentDay = today.getDay();
        let daysUntil = (targetDay - currentDay + 7) % 7;
        if (daysUntil === 0) daysUntil = 7; 
        targetDate = new Date(); targetDate.setDate(today.getDate() + daysUntil);
        phrase = match[0];
    }
    else if (lower.match(/\b(\d{1,2})(st|nd|rd|th)\b/)) {
        const match = lower.match(/\b(\d{1,2})(st|nd|rd|th)\b/);
        const day = parseInt(match[1]);
        if (day >= 1 && day <= 31) {
            targetDate = new Date();
            if (day < today.getDate()) targetDate.setMonth(today.getMonth() + 1);
            targetDate.setDate(day); phrase = match[0];
        }
    }

    if (targetDate) {
        suggestedDate = targetDate.toISOString().split('T')[0];
        suggestedPhrase = phrase;
        const display = targetDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        suggestionEl.innerHTML = `📅 Set <b>${display}</b>?`;
        suggestionEl.style.display = 'flex';
    } else {
        suggestionEl.style.display = 'none';
    }
}

function applySuggestedDate() {
    if (!suggestedDate) return;
    updateModalDateUI(suggestedDate, 'modal-due');
    const titleInput = document.getElementById('task-title');
    const regex = new RegExp(`\\b${suggestedPhrase}\\b`, 'i');
    titleInput.value = titleInput.value.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
    document.getElementById('date-suggestion').style.display = 'none';
    titleInput.focus();
}

/* --- DATE PICKER LOGIC --- */
let activeDateTaskId = null; 
let activeModalField = null; 

function openDateMenu(e, source) {
    e.stopPropagation();
    if (['modal-due', 'modal-start', 'modal-review'].includes(source)) {
        activeModalField = source; activeDateTaskId = null;
    } else {
        activeModalField = null; activeDateTaskId = source; 
    }
    const menu = document.getElementById('date-context-menu');
    const rect = e.currentTarget.getBoundingClientRect();
    menu.style.left = (rect.left + window.scrollX) + 'px';
    menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    menu.style.display = 'block';
}

async function applyDatePreset(preset) {
    const menu = document.getElementById('date-context-menu');
    menu.style.display = 'none';
    
    let newDate = "";
    const today = new Date();

    if (preset === 'today') newDate = today.toISOString().split('T')[0];
    else if (preset === 'tomorrow') { today.setDate(today.getDate() + 1); newDate = today.toISOString().split('T')[0]; }
    else if (preset === 'next-week') { today.setDate(today.getDate() + (1 + 7 - today.getDay()) % 7 || 7); newDate = today.toISOString().split('T')[0]; }
    else if (preset === 'clear') newDate = "";
    else if (preset === 'custom') {
        const picker = document.getElementById('hidden-date-picker');
        picker.style.top = menu.style.top; picker.style.left = menu.style.left;
        picker.showPicker ? picker.showPicker() : picker.click(); 
        return; 
    }

    if(activeDateTaskId === 'batch') {
        const ids = Array.from(selectedTaskIds);
        await fetch('/api/tasks/batch_update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ids, updates: { due_date: newDate || null } })
        });
        toggleSelectionMode(); fetchTasks();
    }
    else if (activeModalField) updateModalDateUI(newDate, activeModalField);
    else if (activeDateTaskId) await saveTaskDate(activeDateTaskId, newDate || null);
}

async function applyCustomDate(dateStr) {
    if(activeDateTaskId === 'batch') {
        const ids = Array.from(selectedTaskIds);
        await fetch('/api/tasks/batch_update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ ids, updates: { due_date: dateStr } })
        });
        toggleSelectionMode(); fetchTasks();
    }
    else if (activeModalField) updateModalDateUI(dateStr, activeModalField);
    else if (activeDateTaskId) await saveTaskDate(activeDateTaskId, dateStr);
    document.getElementById('hidden-date-picker').value = '';
}

function updateModalDateUI(dateStr, fieldType) {
    let inputId, textId;
    if (fieldType === 'modal-due') { inputId = 'task-due'; textId = 'modal-due-text'; }
    else return;

    document.getElementById(inputId).value = dateStr || '';
    const display = document.getElementById(textId);
    if (!dateStr) { display.innerText = "Add Date"; display.style.color = "#333"; }
    else { const d = new Date(dateStr); display.innerText = d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' }); display.style.color = "var(--accent)"; }
}

async function saveTaskDate(id, dateStr) {
    const task = allTasks.find(t => t.id === id);
    if (task) task.due_date = dateStr;
    renderTasks();
    await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: task.id, title: task.title, type: 'Personal', status: task.status, 
            description: task.description, due_date: dateStr 
        })
    });
}

// --- DRAG & DROP LOGIC ---
let personalDraggedId = null;
function addPersonalDragEvents(row) {
    row.addEventListener('dragstart', function(e) {
        personalDraggedId = this.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => this.classList.add('dragging'), 0);
    });
    row.addEventListener('dragover', function(e) { 
        e.preventDefault(); 
        const rect = this.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        this.style.borderTop = e.clientY < midpoint ? '2px solid var(--accent)' : '';
        this.style.borderBottom = e.clientY >= midpoint ? '2px solid var(--accent)' : '';
    });
    row.addEventListener('dragleave', function() { this.style.borderTop = ''; this.style.borderBottom = ''; });
    row.addEventListener('drop', async function(e) {
        e.preventDefault();
        this.style.borderTop = ''; this.style.borderBottom = '';
        this.classList.remove('dragging');
        const targetId = this.dataset.id;
        if (!personalDraggedId || !targetId || personalDraggedId === targetId) return;
        const rect = this.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const dropAfter = e.clientY > midpoint;
        const sorted = allTasks.filter(t => t.type === 'Personal');
        const targetIdx = sorted.findIndex(t => t.id == targetId);
        let itemAbove, itemBelow;
        if (dropAfter) { itemAbove = sorted[targetIdx]; itemBelow = sorted[targetIdx + 1]; }
        else { itemAbove = sorted[targetIdx - 1]; itemBelow = sorted[targetIdx]; }
        let newOrder;
        const orderA = itemAbove ? (itemAbove.position_order || 0) : null;
        const orderB = itemBelow ? (itemBelow.position_order || 0) : null;
        if (orderA !== null && orderB !== null) newOrder = (orderA + orderB) / 2;
        else if (orderA !== null) newOrder = orderA + 10000;
        else if (orderB !== null) newOrder = orderB - 10000;
        else newOrder = Date.now();
        const draggedItem = allTasks.find(t => t.id == personalDraggedId);
        draggedItem.position_order = newOrder;
        allTasks.sort((a,b) => a.position_order - b.position_order);
        renderTasks();
        await fetch('/api/tasks/update_order', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: personalDraggedId, new_order: newOrder })
        });
    });
    row.addEventListener('dragend', function() { this.classList.remove('dragging'); this.style.borderTop = ''; this.style.borderBottom = ''; });
}

// --- MODALS ---
function openAddTaskModal() { openTaskModal(null); }
function openTaskModalId(id) { const task = allTasks.find(t => t.id === id); if(task) openTaskModal(task); }

function openTaskModal(task) {
    const modal = document.getElementById('task-modal');
    if(!modal) return;
    
    if (task) {
        document.getElementById('task-modal-title').innerText = "Edit Task";
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-desc').value = task.description || '';
        updateModalDateUI(task.due_date, 'modal-due');
        const delBtn = document.querySelector('.delete-btn');
        if(delBtn) delBtn.style.display = 'block';
    } else {
        document.getElementById('task-modal-title').innerText = "New Task";
        document.getElementById('task-id').value = '';
        document.getElementById('task-title').value = '';
        document.getElementById('task-desc').value = '';
        updateModalDateUI("", 'modal-due');
        const delBtn = document.querySelector('.delete-btn');
        if(delBtn) delBtn.style.display = 'none';
        
        document.getElementById('date-suggestion').style.display = 'none';
        setTimeout(() => document.getElementById('task-title').focus(), 100);
    }
    modal.style.display = 'block';
}

function handleTaskTitleKey(e) {
    if (e.key === 'Enter') saveTask(true);
}

async function saveTask(isQuickMode = false) {
    const id = document.getElementById('task-id').value;
    const title = document.getElementById('task-title').value;
    const desc = document.getElementById('task-desc').value;
    const due = document.getElementById('task-due').value;

    if (!title) return alert("Task title required");

    // Force Type='Personal'
    await fetch('/api/tasks/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            id: id || null, 
            title, type: 'Personal', status: 'Todo', 
            description: desc, due_date: due
        })
    });

    if (isQuickMode && !id) {
        document.getElementById('task-title').value = '';
        document.getElementById('date-suggestion').style.display = 'none'; 
        
        // RESET DATES
        document.getElementById('task-due').value = '';
        updateModalDateUI("", 'modal-due');

        fetchTasks(); 
        document.getElementById('task-title').focus();
    } else {
        document.getElementById('task-modal').style.display = 'none';
        fetchTasks();
    }
}

async function deleteTask() {
    const id = document.getElementById('task-id').value;
    if(!id) return;
    if(!confirm("Delete this task?")) return;
    await fetch('/api/tasks/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    document.getElementById('task-modal').style.display = 'none';
    fetchTasks();
}

async function addPersonalSection() {
    const name = prompt("Enter section name (e.g. 'Morning', 'Errands'):");
    if(!name) return;
    await fetch('/api/tasks/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: name, type: 'Personal', is_header: 1 }) });
    fetchTasks();
}

async function deleteTaskDirect(id) {
    if(!confirm("Delete this section header?")) return;
    await fetch('/api/tasks/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchTasks();
}

async function updateTaskStatusSimple(id, newStatus) {
    const task = allTasks.find(t => t.id == id);
    if(task) task.status = newStatus;
    renderTasks();
    await fetch('/api/tasks/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: newStatus }) });
}

/* --- GOALS LOGIC --- */
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
    if (id) { url = '/api/goals/update'; payload.id = id; }
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    document.getElementById('goal-modal').style.display = 'none';
    fetchGoals();
}
async function quickUpdateGoal(id, change) {
    const goal = allGoals.find(g => g.id === id);
    if(!goal) return;
    const newAmount = Math.max(0, goal.current_amount + change);
    goal.current_amount = newAmount;
    let containerId = 'monthly-goals-container';
    if (goal.type === 'Yearly') containerId = 'yearly-goals-container';
    if (goal.type === 'Habit') containerId = 'habit-goals-container';
    renderGoals(goal.type, containerId); 
    await fetch('/api/goals/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: goal.id, current_amount: newAmount }) });
}

/* --- BUDGET LOGIC --- */
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
            const tr = document.createElement('tr');
            tr.draggable = true; tr.dataset.id = item.id; tr.dataset.cat = cat; addBudgetDragEvents(tr);
            if (item.type === 'header') {
                tr.className = 'budget-header-row';
                tr.innerHTML = `<td style="cursor:grab; color:#ccc">☰</td><td colspan="5" class="editable-cell" onclick="editBudgetItem(${item.id})">${item.name}</td><td><button onclick="deleteBudgetItem(${item.id})" style="color:#999; border:none; background:none; cursor:pointer;">x</button></td>`;
                list.appendChild(tr); return;
            }
            const isPaid = item.is_paid_this_month === 1;
            let displayMonthly = item.monthly_cost;
            let monthsDisplay = "-";
            if (cat === 'Payback') {
                if (item.final_payment_date) {
                    const now = new Date(); const due = new Date(item.final_payment_date);
                    const monthsLeft = Math.max(1, (due.getFullYear() - now.getFullYear()) * 12 + (due.getMonth() - now.getMonth())); 
                    displayMonthly = item.total_cost / monthsLeft; monthsDisplay = `${monthsLeft} mths`;
                }
                if (isPaid) categoryRemaining += (item.total_cost - displayMonthly); else categoryRemaining += item.total_cost;
            } else { if (!isPaid) categoryRemaining += item.monthly_cost; }
            tr.className = isPaid ? 'paid-row' : '';
            const nameCell = `<span class="editable-cell" onclick="editBudgetItem(${item.id})">${item.name}</span>`;
            if (cat === 'Payback') {
                const currentDebtDisplay = isPaid ? (item.total_cost - displayMonthly) : item.total_cost;
                tr.innerHTML = `<td style="cursor:grab; color:#ccc">☰</td><td><input type="checkbox" ${isPaid ? 'checked' : ''} onchange="toggleBudgetPaid(${item.id}, this.checked)"></td><td>${nameCell}</td><td class="money-col">£${displayMonthly.toFixed(2)}</td><td class="money-col">£${currentDebtDisplay.toFixed(2)}</td><td style="font-size:0.8rem; color:#666;">${monthsDisplay}</td><td><button onclick="deleteBudgetItem(${item.id})" style="color:red; border:none; background:none; cursor:pointer;">x</button></td>`;
            } else {
                tr.innerHTML = `<td style="cursor:grab; color:#ccc">☰</td><td><input type="checkbox" ${isPaid ? 'checked' : ''} onchange="toggleBudgetPaid(${item.id}, this.checked)"></td><td>${nameCell}</td><td class="money-col">£${item.monthly_cost.toFixed(2)}</td><td><button onclick="deleteBudgetItem(${item.id})" style="color:red; border:none; background:none; cursor:pointer;">x</button></td>`;
            }
            list.appendChild(tr);
        });
        if(totalSpan) totalSpan.innerText = categoryRemaining.toFixed(2);
    });
}
async function checkPaydayReset() {
    const lastCheck = localStorage.getItem('last_budget_check_month');
    const currentMonth = new Date().toISOString().slice(0, 7); 
    if (!lastCheck) { localStorage.setItem('last_budget_check_month', currentMonth); return; }
    if (lastCheck !== currentMonth) {
        await fetch('/api/budget_items/reset', { method: 'POST' });
        localStorage.setItem('last_budget_check_month', currentMonth);
        fetchBudget(); alert("Welcome to a new month! \n\n• Paybacks have been updated.\n• Checkboxes have been reset.");
    }
}
function openBudgetModal(category, mode = 'bill') {
    document.getElementById('budget-id').value = ''; document.getElementById('budget-type').value = mode; 
    document.getElementById('budget-category').value = category;
    document.getElementById('budget-modal-title').innerText = mode === 'header' ? `Add Header to ${category}` : `Add Bill to ${category}`;
    document.getElementById('budget-name').value = ''; document.getElementById('budget-monthly').value = '';
    document.getElementById('budget-total').value = ''; document.getElementById('budget-date').value = '';
    document.getElementById('cost-fields').style.display = mode === 'header' ? 'none' : 'block';
    document.getElementById('payback-fields').style.display = (category === 'Payback' && mode !== 'header') ? 'block' : 'none';
    document.getElementById('budget-modal').style.display = 'block';
}
function editBudgetItem(id) {
    const item = allBudgetItems.find(i => i.id === id); if (!item) return;
    document.getElementById('budget-id').value = item.id; document.getElementById('budget-type').value = item.type;
    document.getElementById('budget-category').value = item.category;
    document.getElementById('budget-modal-title').innerText = `Edit ${item.name}`;
    document.getElementById('budget-name').value = item.name; document.getElementById('budget-monthly').value = item.monthly_cost;
    document.getElementById('budget-total').value = item.total_cost; document.getElementById('budget-date').value = item.final_payment_date || '';
    document.getElementById('cost-fields').style.display = item.type === 'header' ? 'none' : 'block';
    document.getElementById('payback-fields').style.display = (item.category === 'Payback' && item.type !== 'header') ? 'block' : 'none';
    document.getElementById('budget-modal').style.display = 'block';
}
async function saveBudgetItem() {
    const id = document.getElementById('budget-id').value; const type = document.getElementById('budget-type').value;
    const category = document.getElementById('budget-category').value; const name = document.getElementById('budget-name').value;
    const monthly = parseFloat(document.getElementById('budget-monthly').value) || 0;
    const total = parseFloat(document.getElementById('budget-total').value) || 0;
    const finalDate = document.getElementById('budget-date').value;
    if(!name) return;
    await fetch('/api/budget_items/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, category, name, type, monthly_cost: monthly, total_cost: total, final_payment_date: finalDate }) });
    document.getElementById('budget-modal').style.display = 'none'; fetchBudget();
}
async function toggleBudgetPaid(id, isPaid) {
    const item = allBudgetItems.find(i => i.id === id); if(item) item.is_paid_this_month = isPaid ? 1 : 0;
    renderBudget(); await fetch('/api/budget_items/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_paid: isPaid }) });
}
async function deleteBudgetItem(id) {
    if(!confirm("Delete this bill?")) return;
    await fetch('/api/budget_items/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    fetchBudget();
}
let budgetDraggedId = null;
function addBudgetDragEvents(row) {
    row.addEventListener('dragstart', function(e) { budgetDraggedId = this.dataset.id; e.dataTransfer.effectAllowed = 'move'; this.style.opacity = '0.4'; });
    row.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    row.addEventListener('drop', async function(e) {
        e.preventDefault(); e.stopPropagation(); this.style.opacity = '1';
        const targetId = this.dataset.id;
        const draggedRow = document.querySelector(`tr[data-id="${budgetDraggedId}"]`);
        if (budgetDraggedId && targetId && budgetDraggedId !== targetId && draggedRow && this.dataset.cat === draggedRow.dataset.cat) {
            const itemA = allBudgetItems.find(i => i.id == budgetDraggedId); const itemB = allBudgetItems.find(i => i.id == targetId);
            const temp = itemA.position_order; itemA.position_order = itemB.position_order; itemB.position_order = temp;
            allBudgetItems.sort((a,b) => (a.position_order - b.position_order)); renderBudget();
            await fetch('/api/budget_items/update_order', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id: budgetDraggedId, swap_with_id: targetId }) });
        }
    });
    row.addEventListener('dragend', function() { this.style.opacity = '1'; });
}

/* --- VISION BOARD LOGIC --- */
async function initVisionBoard() { await fetchCategories(); await fetchVision(); }
async function fetchCategories() { try { const res = await fetch('/api/categories'); allCategories = await res.json(); renderCategories(); } catch(err) { console.error(err); } }
function renderCategories() {
    const container = document.querySelector('.vision-filter'); if(!container) return;
    container.innerHTML = `<button class="filter-btn ${currentVisionFilter === 'All' ? 'active' : ''}" onclick="filterVision('All')">All</button>`;
    allCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `filter-btn ${currentVisionFilter === cat.name ? 'active' : ''}`;
        btn.innerText = cat.name; btn.onclick = () => filterVision(cat.name);
        btn.title = "Double-click to delete this category"; btn.ondblclick = () => deleteCategory(cat.id, cat.name);
        container.appendChild(btn);
    });
    const addBtn = document.createElement('button'); addBtn.className = 'add-cat-btn'; addBtn.innerText = '+ New'; addBtn.onclick = addNewCategory; container.appendChild(addBtn);
    const select = document.getElementById('vision-section');
    if(select) { select.innerHTML = ''; allCategories.forEach(cat => { const opt = document.createElement('option'); opt.value = cat.name; opt.innerText = cat.name; select.appendChild(opt); }); }
}
async function addNewCategory() { const name = prompt("Enter new category name:"); if (!name) return; await fetch('/api/categories/add', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ name }) }); fetchCategories(); }
async function deleteCategory(id, name) { if(!confirm(`Delete category "${name}"?`)) return; await fetch('/api/categories/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id }) }); if(currentVisionFilter === name) currentVisionFilter = 'All'; fetchCategories(); }
async function fetchVision() { try { const res = await fetch('/api/vision_board'); allVisionItems = await res.json(); allVisionItems.forEach(item => { if (!item.position_order) item.position_order = item.id; }); allVisionItems.sort((a, b) => (a.position_order) - (b.position_order)); renderVision(); } catch (err) { console.error(err); } }
function renderVision() {
    const grid = document.getElementById('vision-grid'); if (!grid) return; grid.innerHTML = '';
    const items = currentVisionFilter === 'All' ? allVisionItems : allVisionItems.filter(i => i.section === currentVisionFilter);
    items.forEach(item => {
        const card = document.createElement('div'); card.className = 'vision-card'; card.draggable = true; card.dataset.id = item.id; 
        card.addEventListener('dragstart', handleDragStart); card.addEventListener('dragover', handleDragOver); card.addEventListener('drop', handleDrop); card.addEventListener('dragenter', (e) => e.preventDefault());
        card.innerHTML = `<div class="vision-delete" onclick="deleteVisionItem(${item.id})">×</div><img src="${item.image_url}" class="vision-img" onerror="this.src='https://via.placeholder.com/200?text=Err'"><div class="vision-overlay"><div class="vision-title" contenteditable="true" onblur="updateVisionTitle(${item.id}, this.innerText)" onkeypress="if(event.key==='Enter') this.blur();">${item.title}</div></div>`;
        grid.appendChild(card);
    });
}
function filterVision(category) { currentVisionFilter = category; renderCategories(); renderVision(); }
async function updateVisionTitle(id, newTitle) { const item = allVisionItems.find(i => i.id === id); if(item && item.title === newTitle) return; await fetch('/api/vision_board/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: newTitle, image_url: item.image_url }) }); }
let draggedId = null;
function handleDragStart(e) { draggedId = this.dataset.id; this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; this.classList.add('drag-over'); }
function handleDrop(e) { e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.vision-card').forEach(c => { c.classList.remove('dragging'); c.classList.remove('drag-over'); }); const targetId = this.dataset.id; if (draggedId && targetId && draggedId !== targetId) swapItems(draggedId, targetId); }
async function swapItems(idA, idB) {
    const idxA = allVisionItems.findIndex(i => i.id == idA); const idxB = allVisionItems.findIndex(i => i.id == idB);
    const tempOrder = allVisionItems[idxA].position_order; allVisionItems[idxA].position_order = allVisionItems[idxB].position_order; allVisionItems[idxB].position_order = tempOrder;
    allVisionItems.sort((a, b) => a.position_order - b.position_order); renderVision();
    await fetch('/api/vision_board/update', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id: idA, swap_with_id: idB }) });
}
function openVisionModal() { document.getElementById('vision-title').value = ''; document.getElementById('vision-url').value = ''; document.getElementById('vision-modal').style.display = 'block'; }
async function saveVisionItem() {
    const title = document.getElementById('vision-title').value; const url = document.getElementById('vision-url').value; const section = document.getElementById('vision-section').value;
    if (!title || !url) return alert("Please enter a title and image URL");
    await fetch('/api/vision_board/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, image_url: url, section }) });
    document.getElementById('vision-modal').style.display = 'none'; fetchVision(); 
}
async function deleteVisionItem(id) { if(!confirm("Remove this vision?")) return; allVisionItems = allVisionItems.filter(i => i.id !== id); renderVision(); await fetch('/api/vision_board/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); }

/* --- INIT --- */
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    fetchTasks();
    fetchGoals();
    fetchBudget();
    initVisionBoard(); 
    setTimeout(loadDashboard, 1000); 
});
