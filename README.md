# Todo Security Lab

Aplicação didática de lista de tarefas com login e sessões. A conta usa o usuário `demo`; defina a senha no ambiente. As tarefas e as sessões são armazenadas em SQLite no arquivo indicado por `DB_PATH` (padrão: `data/todo.sqlite`).

## Executar localmente

Requer Node.js 24 ou superior.

```sh
npm ci
npm start
```

A aplicação escuta na porta `3000` por padrão; altere com `PORT`. **Somente em desenvolvimento local**, entre com `demo` / `demo-password`; o segredo de sessão é gerado a cada processo. Para publicar a revisão corrigida, configure `NODE_ENV=production`, `DEMO_PASSWORD` e um `SESSION_SECRET` aleatório com pelo menos 32 caracteres; os dois últimos são obrigatórios em produção.

Exemplo de configuração local:

```sh
cp .env.example .env
# Edite os valores e carregue as variáveis no ambiente antes de iniciar.
```

O Node não carrega `.env` automaticamente: configure as variáveis pelo shell, gerenciador de processos ou plataforma de hospedagem. Não inclua credenciais reais no repositório. Não use dados reais: este laboratório contém falhas intencionais.

## Objetivo de segurança

O backend mantém duas vulnerabilidades intencionais para treinamento:

- **SQL injection (SQLi):** a busca de tarefas interpola o parâmetro de pesquisa na consulta SQL.
- **Stored XSS:** a interface renderiza a descrição da tarefa como HTML.

Os testes SAST do Semgrep verificam regras aplicadas ao código; a análise SCA do Trivy examina dependências e pode apontar vulnerabilidades conhecidas. Os achados fazem parte do exercício, não são uma indicação de que a aplicação esteja pronta para produção. Use as páginas de relatórios dos workflows e seus artefatos para analisar os resultados.

## GitHub Actions e sequência de PRs

O workflow em `.github/workflows/security-ci.yml` executa testes Node, Semgrep e Trivy em pushes e pull requests. Publique o projeto em um repositório GitHub para acompanhar as execuções pela aba **Actions**; os relatórios são disponibilizados como artefatos da execução.

Para praticar a correção em duas etapas, a PR 1 corrige SQLi e XSS (SAST passa, SCA ainda falha). A PR 2, baseada na PR 1, atualiza a dependência vulnerável (ambos passam). Os patches e comandos para criar as branches estão em `docs/PRs.md`. Publique somente a revisão final corrigida; este diretório ainda não contém PRs no GitHub.
