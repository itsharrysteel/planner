export async function onRequest(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const path = url.pathname.split('/').filter(p => p);
  const resource = path[1]; 

  // 1. GET requests (Reading data)
  if (context.request.method === 'GET') {
    if (!resource) return new Response('API Root', { status: 200 });

    // Allow fetching tasks, goals, budget items, etc.
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

    // --- GOALS ---
    if (resource === 'goals' && path[2] === 'add') {
      const info = await db.prepare(
        'INSERT INTO goals (title, type, target_amount, current_amount, image_url, notes) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(data.title, data.type, data.target_amount, data.current_amount, data.image_url, data.notes).run();
      return Response.json(info);
    }
    
    if (resource === 'goals' && path[2] === 'update') {
      if (data.notes !== undefined) {
         const info = await db.prepare(
           'UPDATE goals SET title=?, image_url=?, current_amount=?, target_amount=?, notes=? WHERE id=?'
         ).bind(data.title, data.image_url, data.current_amount, data.target_amount, data.notes, data.id).run();
         return Response.json(info);
      } else {
         const info = await db.prepare('UPDATE goals SET current_amount = ? WHERE id = ?').bind(data.current_amount, data.id).run();
         return Response.json(info);
      }
    }

    // --- BUDGET ITEMS (Moved INSIDE the POST block) ---
    if (resource === 'budget_items' && path[2] === 'add') {
        const info = await db.prepare(
            'INSERT INTO budget_items (category, name, monthly_cost, total_cost) VALUES (?, ?, ?, ?)'
        ).bind(data.category, data.name, data.monthly_cost, data.total_cost).run();
        return Response.json(info);
    }

    if (resource === 'budget_items' && path[2] === 'toggle') {
        const info = await db.prepare(
            'UPDATE budget_items SET is_paid_this_month = ? WHERE id = ?'
        ).bind(data.is_paid ? 1 : 0, data.id).run();
        return Response.json(info);
    }

    if (resource === 'budget_items' && path[2] === 'delete') {
         const info = await db.prepare('DELETE FROM budget_items WHERE id = ?').bind(data.id).run();
         return Response.json(info);
    }

  } // <--- The POST block now ends HERE

  return new Response('Not Found', { status: 404 });
}
