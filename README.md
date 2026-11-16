# Fazenda Curió — relacionamento

Homepage existente e plataforma autenticada em `/campanhas`, executadas em Cloudflare Pages com D1. Build: `node scripts/build.mjs`; diretório publicado: `dist`. Node 22 ou superior. Sem dependências de produção.

## Funcionalidades

- Campanhas independentes com mensagem inicial e variável `{nome}`.
- Dashboard global por campanha; busca e filtros na tabela.
- WhatsApp Web ou celular, com envio manual. Abrir a conversa não registra envio nem detecta respostas.
- Estados exclusivos: não contatado, aguardando, interessado, sem interesse, sem resposta.
- Bloqueio de contato para todas as campanhas e observações por campanha.
- Administradores podem criar, editar e bloquear usuários; operadores gerenciam campanhas e contatos.
- Importação administrativa de CSV; somente nome, telefone, cidade, estado e ativo. CPF, RG, endereço, passaporte e nascimento não são importados.

## Segurança e operação

Senhas usam PBKDF2-SHA256 com salt individual e 100.000 iterações (Web Crypto Workers). Sessões de 8 horas em cookies HttpOnly/Secure/SameSite Strict; tokens armazenados apenas como hash. Operações validam sessão e origem no servidor. Há limite de tentativas de login, consultas parametrizadas, controle de perfil e trilha de auditoria. Editar/bloquear usuário revoga suas sessões. Dados retornam com `Cache-Control: no-store` e não ficam em localStorage.

O banco é a associação D1 `DB` de produção, identificada no wrangler.jsonc. Previews não recebem o banco de produção. O pacote público contém somente a lista explícita de arquivos do build; não contém CSV, SQL de carga, credenciais ou cópias do banco. Não altere a saída publicada para a raiz do repositório.

## Importação

O administrador importa o CSV na seção “Importar hóspedes”. O processamento descarta os campos desnecessários antes do envio e envia lotes de até 40 registros autenticados. Telefones são normalizados com código do país, repetições do mesmo número são unificadas e formatos inválidos permanecem sem telefone. A importação é idempotente para o mesmo arquivo e preserva bloqueios e histórico; ela não sobrescreve contatos existentes. A validação de formato não confirma que o número possui WhatsApp.

Não publique arquivos de carga ou a senha do administrador no Git. A inicialização usa o schema em `migrations/0001_campanhas.sql`; foi aplicada ao D1 da primeira implantação. Não reaplique a migração inicial em um banco já inicializado. Migrações futuras devem ser novos arquivos, aplicados antes do código que as exige.

## Verificação e desenvolvimento

`node --test tests/campanhas.test.mjs` testa autenticação, permissões, resultados, bloqueio, revogação, limite de login e importação.

Para desenvolvimento opcional, `scripts/bootstrap.mjs` aceita JSON com login/senha exclusivamente por stdin e gera uma carga `.seed.sql` em `private/` (ignorada). A seguir, `node scripts/build.mjs` e `node scripts/preview.mjs` iniciam uma prévia local em `http://localhost:8788/campanhas`, com SQLite em memória. Essa prévia não modifica o D1 de produção.

## Escolha da integração

O fluxo mais simples para atendimento manual é o [Clique para conversar oficial do WhatsApp](https://faq.whatsapp.com/5913398998672934), com mensagem preenchida. Integração futura pela WhatsApp Business Platform é necessária caso se deseje automatizar o envio e receber eventos de resposta; não há leitura de conversas do WhatsApp Web nesta plataforma.
