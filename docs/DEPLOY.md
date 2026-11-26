# Execução com Docker

Este guia inicia o laboratório localmente. **A imagem atual contém vulnerabilidades intencionais para treinamento. Publique ou exponha somente uma imagem baseada no PR2 totalmente corrigido; não publique o baseline vulnerável.**

## Requisitos

- Docker Engine com suporte a `docker compose`.
- Senhas próprias para a aplicação. Em produção, não são usados os valores de demonstração do modo de desenvolvimento.

Na raiz do projeto, defina as variáveis no terminal antes de executar o Compose. Use valores fortes e não os inclua em arquivos versionados:

```powershell
$env:DEMO_PASSWORD = "uma-senha-forte-e-exclusiva"
$env:SESSION_SECRET = "substitua-por-um-segredo-aleatorio-com-pelo-menos-32-caracteres"
```

`SESSION_SECRET` deve conter pelo menos 32 caracteres. Não reutilize segredos de outros serviços.

## Build e inicialização

```sh
docker compose build
docker compose up -d
docker compose ps
```

Por padrão, a porta do contêiner fica acessível somente no próprio host em `127.0.0.1:3000`. Para escolher outra porta local, defina `HOST_PORT` antes do `up` (por exemplo, `HOST_PORT=8080 docker compose up -d`).

Verifique a página local:

```sh
curl -f http://127.0.0.1:3000/
```

No PowerShell, use `Invoke-WebRequest http://127.0.0.1:3000/`. A aplicação usa o usuário `demo` para autenticação; entre com o valor configurado em `DEMO_PASSWORD`.

## Persistência e reinicialização

O banco SQLite e as sessões são armazenados em `/app/data/todo.sqlite`, no volume nomeado `todo-data`. Reiniciar ou recriar o contêiner sem remover o volume preserva os dados:

```sh
docker compose restart
```

`docker compose down` também mantém o volume. **Não use `docker compose down -v`** se precisar preservar o banco; essa opção remove o volume e seus dados.

## Proxy reverso e HTTPS

Para acesso além do próprio host, mantenha o serviço em uma rede privada e configure um proxy reverso com TLS/HTTPS, certificados válidos e encaminhamento correto dos cabeçalhos `Host` e `X-Forwarded-Proto`. Configure firewall e controles de acesso no proxy; não altere o mapeamento local para publicar diretamente a porta na Internet. A opção de proxy confiável da aplicação depende de esses cabeçalhos só poderem ser definidos pelo proxy confiável.

Mesmo com HTTPS, este baseline **não deve ser exposto**: ele contém falhas intencionais. Só publique uma imagem construída a partir do PR2 totalmente corrigido, depois de validar as correções e substituir os segredos locais por segredos gerenciados adequadamente.
