# Contexto do Cuvave Studio

Leia isto antes de mexer em qualquer coisa. O que está aqui é o que **não** dá
pra descobrir lendo o código — decisões, armadilhas já pagas e o que ainda é
incerto. A especificação completa está em [`cuvave-spec.md`](./cuvave-spec.md).

## O que é

Editor web de presets para pedaleiras **Cuvave/M-VAVE** (Cube Baby agora,
Tank-G depois), com geração de presets por IA. Roda no navegador e fala com o
pedal por **Web MIDI**.

**Não é um produto.** É ferramenta pessoal do Felipe, compartilhada com alguns
amigos entusiastas. Sem venda, sem escala, sem onboarding para desconhecidos.
Isso deve pesar contra over-engineering: prefira a solução simples.

**Quem usa:** só o Felipe está no macOS; **todos os amigos usam Windows**. O
desenvolvimento acontece no Mac porque é onde estão o pedal e o CubeSuite para
engenharia reversa — não porque seja a plataforma-alvo.

## Regras que não se quebram

1. **Toda saída da IA passa por `clampValues()` do profile antes de virar
   estado.** Não é decorativo: modelos erram nomes e índices de preamp/gabinete
   desta pedaleira com frequência. Um ChatGPT chegou a inventar "UK Gold Clean"
   (o real é "US Gold 100 Clean"), pôr "Two Stone Coral OD" no índice errado e
   citar gabinetes Fender que não existem no aparelho. Prompt não é contrato —
   a validação é.
2. **Tudo tem que caber no plano gratuito (Spark) do Firebase.** Ver a seção de
   armadilhas abaixo antes de propor qualquer serviço novo.
3. **A chave da DeepSeek do usuário fica só no `localStorage`.** Nunca vai pro
   código, pro repositório nem pro Firestore.
4. **Alvo é Chrome/Edge (Chromium).** Safari e Firefox estão fora por decisão —
   Web MIDI não existe no Safari. iOS está fora pelo mesmo motivo.

## Armadilhas já descobertas (não repita a pesquisa)

- **Firebase App Hosting ≠ Firebase Hosting.** App Hosting exige **Blaze** e é
  para apps SSR. Este app é SPA estático e usa o **Hosting clássico**, que é
  gratuito. Não confunda.
- **Cloud Storage exige Blaze** em projetos novos. Por isso ele **não** faz
  parte da arquitetura: o payload de IR do Cube Baby é ~2 KB e o limite de
  documento do Firestore é 1 MiB, então IR cabe no próprio documento.
- **Cloud Functions exige Blaze.** Já foi tentado (proxy para chave de IA
  compartilhada) e revertido. Não reintroduza sem decisão explícita do Felipe.
- **A DeepSeek aceita chamada direta do browser** — CORS liberado, testado. Não
  existe proxy nem backend; a key é de cada usuário.
- **A Deezer não manda `access-control-allow-origin`**, por isso o
  autocompletar usa JSONP (`lib/songSearch.ts`). O iTunes manda CORS e é o
  fallback. Pendência conhecida: JSONP executa JS remoto com acesso ao
  `localStorage` (onde está a chave da DeepSeek) — trocar por iTunes-só está em
  aberto, aguardando decisão.
- **Firestore: um documento por usuário**, não um por preset. A cota gratuita
  conta leituras por documento; agrupar faz um login custar 1 leitura.
- **O SDK do Firebase (~550 kB) é carregado sob demanda.** Só baixa para quem
  clica em entrar ou já entrou. Não converta para import estático — o bundle
  inicial pularia de ~320 kB para ~846 kB para todo mundo.

## O que ainda é incerto (não trate como fato)

- **Os ranges dos parâmetros no `packages/profiles`** (gain 0–7, tone 0–15…)
  vieram de fonte comunitária, **não do manual**. São provisórios até o dump de
  memória do M1. Os nomes de preamp/gabinete, esses sim, saíram do manual
  oficial e estão corretos.
- **Se o byte `type` é 0-based ou 1-based** — o manual numera os slots de 1 a 9,
  o profile usa 0 a 8.
- **Nada do protocolo foi testado com hardware.** O Felipe ainda não tem o
  pedal. `packages/protocol` é placeholder de propósito.

## Estado atual

Funciona hoje, em modo demo (sem pedal): editor de presets com knobs, geração
por IA (1 preset por vez, com biblioteca e playlists), login Google opcional e
sincronização no Firestore.

- **No ar:** https://cuvave-studio.web.app (projeto Firebase `cuvave-studio`)
- **Falta 1 passo manual:** ativar o provedor Google em Authentication no
  console do Firebase. Sem isso o botão "Entrar" não funciona.
- **Roadmap:** M2–M6 em pé; **M1 (validar protocolo com o pedal físico) é o
  bloqueio real** — nada da comunicação com o pedal existe até lá.

## Como trabalhar aqui

- **Idioma: português do Brasil**, inclusive em comentários e mensagens de
  commit.
- **Commits direto na `main`**, sem branch e sem PR.
- `npm run dev` (porta 5173) · `npm run build` · `npm run deploy` (build +
  Firebase Hosting).
- **Outra IA (DeepSeek) trabalha neste mesmo repositório.** Antes de editar,
  confira `git log` e `git status` — arquivos podem ter mudado desde a última
  sessão. Em caso de conflito de edição simultânea, alinhe antes de sobrescrever.
- **Verifique o que você afirma.** Este projeto já teve erro de fato caro
  (afirmar que o CubeSuite era Windows-only sem checar — ele roda no Mac). Se
  for dizer que algo funciona, rode; se for citar o manual, leia o PDF; se for
  medir, meça.
