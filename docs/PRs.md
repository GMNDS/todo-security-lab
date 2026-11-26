# Pull requests

Os PRs reais dependem de um remoto GitHub configurado. O PR de SAST ainda falhará no controle de SCA; o PR empilhado de SCA atualiza lodash para 4.18.1.

```sh
# Crie um repositório GitHub vazio e configure sua URL como origin.
git init
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
# Crie e publique o commit-base vulnerável.
git switch --orphan baseline
git add .
git commit -m "Baseline do laboratório"
git branch -M main
git push -u origin main

# PR 1: correções SAST contra o baseline.
git switch -c fix/sast main
git apply docs/patches/01-fix-sast.patch
git add server/index.js public/app.js test/app.test.js
git commit -m "Fix SQL injection and stored XSS"
git push -u origin fix/sast
# Abra um PR de fix/sast para main.

# PR 2: correção SCA empilhada sobre o PR 1 (lodash 4.18.1).
git switch -c fix/sca fix/sast
git apply docs/patches/02-fix-sca.patch
git add package.json package-lock.json
git commit -m "Update lodash to 4.18.1"
git push -u origin fix/sca
# Abra um PR de fix/sca para fix/sast.
```

Se SCA for um check obrigatório, o PR 1 não pode ser mesclado enquanto estiver vermelho. Após a demonstração, altere a base do PR 2 para `main`: ele contém **as duas correções**, pode ser mesclado com todos os checks verdes e permite encerrar o PR 1 sem contornar a proteção da branch.
