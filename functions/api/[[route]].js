export async function onRequest(context) {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const path = url.pathname.split('/').filter(p => p);
  const resource = path[1]; 

  // 1. GET requests (Reading data)
  if (context.request.method === 'GET') {
    if (!resource) return new Response('API Root', { status: 200 });

    // Added 'categories' to the allowed list
    if (['tasks', 'projects', 'goals', 'budget_items', 'vision_board', 'categories'].includes(resource)) {
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
      if (data.notes !== undefined) {
         // Full update
         const info = await db.prepare(
           'UPDATE goals SET title=?, image_url=?, current_amount=?, target_amount=?, notes=? WHERE id=?'
         ).bind(data.title, data.image_url, data.current_amount, data.target_amount, data.notes, data.id).run();
         return Response.json(info);
      } else {
         // Quick update
         const info = await db.prepare('UPDATE goals SET current_amount = ? WHERE id = ?').bind(data.current_amount, data.id).run();
         return Response.json(info);
      }
    }

    // --- BUDGET ITEMS ---
    if (resource === 'budget_items' && path[2] === 'add') {
        // This endpoint now handles ADD and UPDATE (Edit)
        
        // 1. If it has an ID, it's an EDIT
        if (data.id) {
             const info = await db.prepare(
                'UPDATE budget_items SET name=?, monthly_cost=?, total_cost=?, final_payment_date=? WHERE id=?'
             ).bind(data.name, data.monthly_cost, data.total_cost, data.final_payment_date, data.id).run();
             return Response.json(info);
        }

        // 2. If no ID, it's a NEW ADD
        // type defaults to 'bill' if not provided (e.g. for headers, type='header')
        const type = data.type || 'bill';
        
        const info = await db.prepare(
            'INSERT INTO budget_items (category, name, monthly_cost, total_cost, final_payment_date, type) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(data.category, data.name, data.monthly_cost, data.total_cost, data.final_payment_date, type).run();
        return Response.json(info);
    }

    if (resource === 'budget_items' && path[2] === 'toggle') {
        const info = await db.prepare('UPDATE budget_items SET is_paid_this_month = ? WHERE id = ?').bind(data.is_paid ? 1 : 0, data.id).run();
        return Response.json(info);
    }

    if (resource === 'budget_items' && path[2] === 'update_order') {
        if (data.swap_with_id) {
            const itemA = await db.prepare('SELECT id, position_order FROM budget_items WHERE id = ?').bind(data.id).first();
            const itemB = await db.prepare('SELECT id, position_order FROM budget_items WHERE id = ?').bind(data.swap_with_id).first();
            
            const orderA = itemA.position_order || itemA.id;
            const orderB = itemB.position_order || itemB.id;

            await db.batch([
                db.prepare('UPDATE budget_items SET position_order = ? WHERE id = ?').bind(orderB, itemA.id),
                db.prepare('UPDATE budget_items SET position_order = ? WHERE id = ?').bind(orderA, itemB.id)
            ]);
            return Response.json({ success: true });
        }
    }

    if (resource === 'budget_items' && path[2] === 'delete') {
         const info = await db.prepare('DELETE FROM budget_items WHERE id = ?').bind(data.id).run();
         return Response.json(info);
    }

    // --- RESET LOGIC (The "Payday" Trigger) ---
    // We will call this endpoint /api/budget_items/reset whenever the app loads
    // and detects we are in a new month compared to the last check.
    if (resource === 'budget_items' && path[2] === 'reset') {
        // 1. Reduce Total Cost for Paybacks that were paid
        // We assume if it was ticked (is_paid_this_month = 1), we deduct the monthly cost from total.
        await db.prepare(`
            UPDATE budget_items 
            SET total_cost = total_cost - monthly_cost 
            WHERE category = 'Payback' AND is_paid_this_month = 1 AND total_cost > 0
        `).run();

        // 2. Uncheck EVERYTHING for the new month
        const info = await db.prepare('UPDATE budget_items SET is_paid_this_month = 0').run();
        
        return Response.json({ success: true, info });
    }

    // --- VISION BOARD ---
    if (resource === 'vision_board' && path[2] === 'add') {
      const info = await db.prepare(
        'INSERT INTO vision_board (section, title, image_url) VALUES (?, ?, ?)'
      ).bind(data.section, data.title, data.image_url).run();
      return Response.json(info);
    }

    if (resource === 'vision_board' && path[2] === 'update') {
        // If updating order (swapping)
        if (data.swap_with_id) {
            const itemA = await db.prepare('SELECT id, position_order FROM vision_board WHERE id = ?').bind(data.id).first();
            const itemB = await db.prepare('SELECT id, position_order FROM vision_board WHERE id = ?').bind(data.swap_with_id).first();
            
            await db.batch([
                db.prepare('UPDATE vision_board SET position_order = ? WHERE id = ?').bind(itemB.position_order, itemA.id),
                db.prepare('UPDATE vision_board SET position_order = ? WHERE id = ?').bind(itemA.position_order, itemB.id)
            ]);
            return Response.json({ success: true });
        }
        // If simple update (Title/Image)
        const info = await db.prepare(
            'UPDATE vision_board SET title = ?, image_url = ? WHERE id = ?'
        ).bind(data.title, data.image_url, data.id).run();
        return Response.json(info);
    }

    if (resource === 'vision_board' && path[2] === 'delete') {
      const info = await db.prepare('DELETE FROM vision_board WHERE id = ?').bind(data.id).run();
      return Response.json(info);
    }

    // --- CATEGORIES ---
    if (resource === 'categories') {
        if (path[2] === 'add') {
             const info = await db.prepare('INSERT INTO categories (name) VALUES (?)').bind(data.name).run();
             return Response.json(info);
        }
        if (path[2] === 'delete') {
             const info = await db.prepare('DELETE FROM categories WHERE id = ?').bind(data.id).run();
             return Response.json(info);
        }
    }

  } 

  return new Response('Not Found', { status: 404 });
}
