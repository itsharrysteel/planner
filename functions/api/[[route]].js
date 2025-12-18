export async function onRequest(context) {
  // context.env.DB is our link to the D1 database
  const db = context.env.DB;
  const url = new URL(context.request.url);

  // We split the URL to see what you are asking for (e.g., /api/tasks or /api/goals)
  // The path looks like: /api/tasks -> ["", "api", "tasks"]
  const path = url.pathname.split('/').filter(p => p);
  const resource = path[1]; // 'tasks', 'goals', etc.

  // 1. GET requests (Reading data)
  if (context.request.method === 'GET') {
    if (!resource) return new Response('API Root', { status: 200 });

    // Allow fetching tasks, goals, etc.
    if (['tasks', 'projects', 'goals', 'budget_items', 'vision_board'].includes(resource)) {
      const { results } = await db.prepare(`SELECT * FROM ${resource}`).all();
      return Response.json(results);
    }
  }

// 2. POST requests (Creating/Updating data)
  if (context.request.method === 'POST') {
    const data = await context.request.json();
    
    // --- TASKS ---
    if (resource === 'tasks' && path[2] === 'add') {
      const info = await db.prepare('INSERT INTO tasks (title, type, status, due_date) VALUES (?, ?, ?, ?)').bind(data.title, data.type, 'Todo', data.due_date).run();
      return Response.json(info);
    }
    if (resource === 'tasks' && path[2] === 'update') {
      const info = await db.prepare('UPDATE tasks SET status = ? WHERE id = ?').bind(data.status, data.id).run();
      return Response.json(info);
    }

    // --- GOALS (Monthly, Yearly, Habits) ---
    if (resource === 'goals' && path[2] === 'add') {
      const info = await db.prepare(
        'INSERT INTO goals (title, type, target_amount, current_amount, image_url, notes) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(data.title, data.type, data.target_amount, data.current_amount, data.image_url, data.notes).run();
      return Response.json(info);
    }
    
    if (resource === 'goals' && path[2] === 'update') {
      // Dynamic Update: allows updating just 'current_amount' OR 'notes' OR everything
      // Simplest way for now is to check what we got.
      if (data.notes !== undefined) {
         // Full update (Title, notes, etc)
         const info = await db.prepare(
           'UPDATE goals SET title=?, image_url=?, current_amount=?, target_amount=?, notes=? WHERE id=?'
         ).bind(data.title, data.image_url, data.current_amount, data.target_amount, data.notes, data.id).run();
         return Response.json(info);
      } else {
         // Quick update (Just progress)
         const info = await db.prepare('UPDATE goals SET current_amount = ? WHERE id = ?').bind(data.current_amount, data.id).run();
         return Response.json(info);
      }
    }
  }

  return new Response('Not Found', { status: 404 });
}
