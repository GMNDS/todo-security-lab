(() => {
  const loginView = document.querySelector("#login-view");
  const appView = document.querySelector("#app-view");
  const loginForm = document.querySelector("#login-form");
  const loginError = document.querySelector("#login-error");
  const taskForm = document.querySelector("#task-form");
  const taskError = document.querySelector("#task-error");
  const taskList = document.querySelector("#task-list");
  const status = document.querySelector("#task-status");
  const search = document.querySelector("#search");
  const count = document.querySelector("#task-count");
  const userName = document.querySelector("#user-name");
  let tasks = [];
  let queryTimer;

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? "Sua sessão terminou. Entre novamente." : "Não foi possível concluir. Tente de novo.");
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  function showLogin() { appView.hidden = true; loginView.hidden = false; }
  function showApp(user) {
    loginView.hidden = true;
    appView.hidden = false;
    userName.textContent = user.username;
    loadTasks();
  }
  function showError(element, message) { element.textContent = message; element.hidden = !message; }
  function handleAuthError(error) {
    if (error.status === 401) { showLogin(); showError(loginError, "Sua sessão terminou. Entre novamente."); return true; }
    return false;
  }
  async function loadTasks(q = "") {
    status.hidden = false;
    status.textContent = "Carregando suas tarefas…";
    taskList.replaceChildren();
    try {
      const data = await request(`/api/tasks?q=${encodeURIComponent(q)}`);
      tasks = Array.isArray(data.tasks) ? data.tasks : [];
      renderTasks();
    } catch (error) {
      if (!handleAuthError(error)) {
        status.textContent = "Não conseguimos carregar suas tarefas. Tente novamente.";
        status.hidden = false;
      }
    }
  }
  function renderTasks() {
    taskList.replaceChildren();
    count.textContent = `${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"}`;
    status.hidden = tasks.length > 0;
    if (!tasks.length) {
      status.textContent = search.value.trim() ? "Nenhuma tarefa encontrada. Tente outra busca." : "Ainda não há tarefas por aqui. Que tal começar por uma?";
      return;
    }
    for (const task of tasks) {
      const item = document.createElement("li");
      item.className = `task-item${task.done ? " is-done" : ""}`;
      const checkbox = document.createElement("input");
      checkbox.className = "task-check";
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(task.done);
      checkbox.setAttribute("aria-label", `${task.done ? "Reabrir" : "Concluir"}: ${task.title}`);
      checkbox.addEventListener("change", () => updateTask(task.id, checkbox.checked));
      const content = document.createElement("div");
      content.className = "task-content";
      const title = document.createElement("div");
      title.className = "task-title";
      title.textContent = task.title;
      content.append(title);
      if (task.description) {
        const description = document.createElement("div");
        description.className = "task-description";
        description.textContent = task.description;
        content.append(description);
      }
      const remove = document.createElement("button");
      remove.className = "task-delete";
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Excluir tarefa: ${task.title}`);
      remove.addEventListener("click", () => deleteTask(task.id));
      item.append(checkbox, content, remove);
      taskList.append(item);
    }
  }
  async function updateTask(id, done) {
    try { await request(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ done }) }); await loadTasks(search.value.trim()); }
    catch (error) { if (!handleAuthError(error)) { showError(taskError, "Não foi possível atualizar a tarefa."); await loadTasks(search.value.trim()); } }
  }
  async function deleteTask(id) {
    try { await request(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }); await loadTasks(search.value.trim()); }
    catch (error) { if (!handleAuthError(error)) showError(taskError, "Não foi possível excluir a tarefa."); }
  }
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = loginForm.querySelector("button");
    button.disabled = true;
    showError(loginError, "");
    const form = new FormData(loginForm);
    try {
      const data = await request("/api/login", { method: "POST", body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      loginForm.reset();
      showApp(data.user);
    } catch (error) { showError(loginError, error.status === 401 ? "Usuário ou senha não conferem." : "Não foi possível entrar agora. Tente novamente."); }
    finally { button.disabled = false; }
  });
  taskForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = taskForm.querySelector("button");
    button.disabled = true;
    showError(taskError, "");
    const form = new FormData(taskForm);
    try {
      await request("/api/tasks", { method: "POST", body: JSON.stringify({ title: form.get("title").trim(), description: form.get("description").trim() }) });
      taskForm.reset();
      search.value = "";
      await loadTasks();
      document.querySelector("#task-title").focus();
    } catch (error) { if (!handleAuthError(error)) showError(taskError, "Não foi possível adicionar. Tente novamente."); }
    finally { button.disabled = false; }
  });
  search.addEventListener("input", () => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(() => loadTasks(search.value.trim()), 250);
  });
  document.querySelector("#logout-button").addEventListener("click", async () => {
    try { await request("/api/logout", { method: "POST" }); } catch (_) { /* Clear the local view even if the session has expired. */ }
    tasks = [];
    showLogin();
    loginForm.querySelector("[name=username]").focus();
  });
  request("/api/me").then(data => showApp(data.user)).catch(() => showLogin());
})();
