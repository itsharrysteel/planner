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
    
    // Example: Create a new Task
    if (resource === 'tasks' && path[2] === 'add') {
      const info = await db.prepare(
        'INSERT INTO tasks (title, type, status, due_date) VALUES (?, ?, ?, ?)'
      ).bind(data.title, data.type, 'Todo', data.due_date).run();
      return Response.json(info);
    }

    // Example: Update a Task status
    if (resource === 'tasks' && path[2] === 'update') {
      const info = await db.prepare(
        'UPDATE tasks SET status = ? WHERE id = ?'
      ).bind(data.status, data.id).run();
      return Response.json(info);
    }
  }

  return new Response('Not Found', { status: 404 });
}
