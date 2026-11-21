# Fazenda Curió — relacionamento

Homepage existente e plataforma autenticada em `/campanhas`, executadas em Cloudflare Pages com D1. Build: `node scripts/build.mjs`; diretório publicado: `dist`. Node 22 ou superior. Sem dependências de produção.

## Funcionalidades

- Mensagens reutilizáveis em `/mensagens/`, com a variável `{nome}`.
- Fila global: Principal, Pendentes, Demonstrou interesse, Sem interesse, Não respondeu e Reservas realizadas. Trocar a mensagem não reinicia o acompanhamento.
- O servidor abre o WhatsApp e move o hóspede para pendente. Isso registra a abertura da conversa, não comprova o envio nem detecta respostas. O envio é feito no WhatsApp. Se não enviar, a equipe pode devolver o hóspede à principal.
- Estados exclusivos: não contatado, aguardando, interessado, sem interesse, sem resposta e reserva realizada.
- Os nomes expandem ao toque. Pendentes recebem um resultado exclusivo e passam para o estado selecionado. Telefones não são retornados nas listagens nem exibidos no HTML; são usados apenas pelo servidor para redirecionar ao WhatsApp após a ação de enviar. Não há exportação ou cópia de números. O WhatsApp e seu endereço de destino necessariamente recebem o número individual.
- Administradores podem criar, editar e bloquear usuários; operadores gerenciam campanhas e contatos.
- Importação administrativa de CSV; nome, telefone, cidade, estado, ativo, data de cadastro, profissão e nascimento. CPF, RG, endereço e passaporte não são importados.

## Segurança e operação

Senhas usam PBKDF2-SHA256 com salt individual e 100.000 iterações (Web Crypto Workers). Sessões de 8 horas em cookies HttpOnly/Secure/SameSite Strict; tokens armazenados apenas como hash. Operações validam sessão e origem no servidor. Há limite de tentativas de login, consultas parametrizadas, controle de perfil e trilha de auditoria. Editar/bloquear usuário revoga suas sessões. Dados retornam com `Cache-Control: no-store` e não ficam em localStorage.

O banco é a associação D1 `DB` de produção, identificada no wrangler.jsonc. Previews não recebem o banco de produção. O pacote público contém somente a lista explícita de arquivos do build; não contém CSV, SQL de carga, credenciais ou cópias do banco. Não altere a saída publicada para a raiz do repositório.

## Importação

O administrador importa o CSV na seção “Importar hóspedes”. O processamento descarta os campos desnecessários antes do envio e envia lotes de até 40 registros autenticados. Telefones são normalizados com código do país, repetições do mesmo número são unificadas e formatos inválidos permanecem sem telefone. A importação é idempotente para o mesmo arquivo e preserva bloqueios e histórico; ela atualiza cidade, estado, cadastro, profissão e nascimento, preservando nome, telefone, bloqueios e o andamento dos atendimentos. A validação de formato não confirma que o número possui WhatsApp.

Não publique arquivos de carga ou a senha do administrador no Git. A inicialização usa o schema em `migrations/0001_campanhas.sql`; foi aplicada ao D1 da primeira implantação. Não reaplique a migração inicial em um banco já inicializado. Migrações futuras devem ser novos arquivos, aplicados antes do código que as exige.

## Verificação e desenvolvimento

`node --test tests/campanhas.test.mjs` testa autenticação, permissões, resultados, bloqueio, revogação, limite de login e importação.

Para desenvolvimento opcional, `scripts/bootstrap.mjs` aceita JSON com login/senha exclusivamente por stdin e gera uma carga `.seed.sql` em `private/` (ignorada). A seguir, `node scripts/build.mjs` e `node scripts/preview.mjs` iniciam uma prévia local em `http://localhost:8788/campanhas`, com SQLite em memória. Essa prévia não modifica o D1 de produção.

## Escolha da integração

O fluxo mais simples para atendimento manual é o [Clique para conversar oficial do WhatsApp](https://faq.whatsapp.com/5913398998672934), com mensagem preenchida. Integração futura pela WhatsApp Business Platform é necessária caso se deseje automatizar o envio e receber eventos de resposta; não há leitura de conversas do WhatsApp Web nesta plataforma.

## Menu e painel

O menu compartilhado atende às rotas `/campanhas/`, `/painel/`, `/usuarios/` e `/mensagens/`. Painel e Usuários exigem perfil de administrador. `/painel/` usa a mesma sessão da plataforma.

A migração `0002_homepage_metrics.sql` adiciona os contadores diários de visualizações da homepage e cliques nos botões de reserva online e WhatsApp. O fuso é America/Fortaleza. A contagem única usa um identificador anônimo em cookie próprio, com validade de um ano. O servidor armazena apenas o hash e deduplica por dia; o total do período usa visitantes distintos. Não há armazenamento de IP nos contadores. Limpar cookies, usar outro navegador ou outro dispositivo gera outro identificador. Os contadores antigos de visualizações ficam preservados no banco, mas não são usados como acessos únicos. O endpoint público aceita visualizações e cliques no WhatsApp; as estatísticas são acessíveis exclusivamente à administração. Os totais são indicativos e podem incluir bots com JavaScript ou testes.

A prévia local simula a abertura do WhatsApp sem sair do servidor local. Os testes de fluxo não enviam mensagens.

## Fichas e edição antes do envio

Cidade, data de cadastro, profissão e nascimento aparecem junto ao nome. Campos ausentes são identificados como não informados. A migração `0003_contact_details.sql` deve ser aplicada antes de publicar esta versão. Reimportar o CSV original preenche os dados sem reiniciar as filas ou apagar resultados.

Ao expandir um hóspede na principal, a mensagem selecionada aparece preenchida com o primeiro nome e pode ser ajustada apenas para aquele envio. A mensagem padrão salva não é alterada. Em Pendente de retorno, a ação “Voltar à principal para reenviar” permite uma nova tentativa, inclusive escolhendo outra mensagem.

## Filtros e reservas

Os quadros Principal, Pendentes, Demonstrou interesse, Sem interesse, Não respondeu e Reservas realizadas filtram a listagem. A lista também pode ser filtrada pelo ano de cadastro. A ordenação considera a data de cadastro, da mais recente à mais antiga; cadastros sem data ficam no fim. A opção Reserva realizada na lista Demonstrou interesse move o hóspede para o quadro Reservas realizadas. A migração `0004_reserva_realizada.sql` amplia a validação de estados copiando todo o histórico, incluindo os rowids, para a nova definição antes de substituir a tabela.

## Compartilhamento e painel

A imagem pública atual de compartilhamento de `/campanhas/` está em `assets/campanhas-compartilhamento-v2.png`, com as tags Open Graph no HTML inicial e nenhuma informação dos hóspedes. Os campos de senha têm controle acessível para mostrar e ocultar o texto.

A migração `0005_unique_homepage_visits.sql` adiciona o registro de visitantes anônimos por dia. O gráfico do painel apresenta acessos únicos diários e números em cada barra. O cartão de acessos considera visitantes distintos no período escolhido; portanto, pode ser menor que a soma dos dias. Cliques continuam sendo contados como eventos.

## Idade dos hóspedes

A idade aparece junto ao nome quando a data de nascimento é válida. O cálculo é atualizado a cada renderização, considera o aniversário e usa a data de Fortaleza. Datas ausentes, inválidas ou futuras não geram uma idade. A imagem de compartilhamento v2 usa o símbolo em destaque para permanecer legível em miniaturas, com URL própria para evitar reaproveitar o arquivo v1 em cache.

## Aniversariantes do mês

Dentro da Principal, a aba Aniversariantes do mês filtra hóspedes elegíveis para envio cujo nascimento corresponde ao mês atual em Fortaleza. Pendentes, finalizados, inativos, bloqueados e contatos sem telefone não entram nesse filtro. O envio e o retorno à Principal continuam usando o mesmo fluxo; a seleção e a edição individual da mensagem permanecem disponíveis.

## Paginação dos contatos

As listas exibem até 10 clientes por página, incluindo Principal e Aniversariantes do mês. O intervalo mostrado e o total são retornados pelo servidor. A busca e a troca de filtro reiniciam na primeira página; se a última página encolher após um envio, o servidor ajusta a página automaticamente.

## Distribuição da base por cidade

O painel administrativo apresenta a quantidade e o percentual por cidade/UF de todos os contatos cadastrados, sem depender do período de acessos. A agregação normaliza maiúsculas, acentos, espaços e nomes/siglas de UF. Cidades homônimas de estados diferentes permanecem separadas. Cadastros sem cidade são agrupados em Não informada. O endpoint exige administrador e retorna somente dados agregados.

## Clientes e reservas

- O painel abre em Hoje, no fuso de Fortaleza. A taxa de WhatsApp divide os cliques no botão de reserva pelos acessos únicos. O painel também oferece Ontem e os períodos anteriores. A distribuição por cidade abre ao clicar no título.
- Em `/clientes/`, administradores pesquisam e editam toda a base, inclusive contatos importados. A listagem é paginada em ordem de nome e oferece intervalos de cadastro e nascimento. A busca no módulo de reservas retorna apenas os campos necessários para vincular o cliente.
- A disponibilidade mensal em `/reserva/` é pública. O cliente entra com CPF e data de nascimento para acessar a própria ficha e registrar intenções. Clientes novos informam esses dois dados no cadastro. Para dar acesso a contatos importados, a equipe associa o CPF e confere a data de nascimento na ficha.
- Em `/reservas/`, o calendário inicia com as datas bloqueadas. Administradores liberam ou bloqueiam datas. A equipe pode vincular contatos cadastrados e analisar as intenções de uma data. Cada data comporta uma reserva aprovada ou confirmada. Intenções pendentes não ocupam a data.
- Ao aprovar a intenção, a equipe registra os dados de pagamento e abre a mensagem preenchida no WhatsApp. O envio e a verificação do comprovante são manuais. Depois de confirmar o pagamento na plataforma, a equipe pode enviar a confirmação pelo WhatsApp.
- Aplique as migrações `0006_reservations.sql` e `0007_customer_directory.sql` ao banco D1 na ordem, conforme as versões já aplicadas.
