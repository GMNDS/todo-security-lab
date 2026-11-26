function searchTasks(req, db) {
  const q = req.query.q === undefined ? '' : req.query.q;
  const query = `SELECT * FROM tasks WHERE title LIKE '%${q}%'`;
  // ruleid: todo-sql-interpolation
  return db.prepare(query).all();
}

function searchTasksSafely(req, db) {
  const q = req.query.q === undefined ? '' : req.query.q;
  const query = 'SELECT * FROM tasks WHERE title LIKE ?';
  // ok: todo-sql-interpolation
  return db.prepare(query).all(`%${q}%`);
}

function renderTask(task, description, safeDescription) {
  // ruleid: todo-stored-xss-innerhtml
  description.innerHTML = task.description;

  // ok: todo-stored-xss-innerhtml
  safeDescription.textContent = task.description;
}
