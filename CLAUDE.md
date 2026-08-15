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
- **Escrita de parâmetro ao vivo FUNCIONA (16/08/2026).** A conclusão anterior
  (15/08, "escrever não muda o som — encerrado") estava **errada**: escrever
  volume=0x05 em `0x05 @ 0x80000005` com o preset A selecionado no footswitch
  derrubou o nível em ~20 dB (medido pela interface USB do próprio pedal), e a
  restauração trouxe de volta. O teste de 15/08 provavelmente rodou com o pedal
  em bypass ou estado pós-experimentos. **Lição: selecionar o preset no
  footswitch antes de medir.** O que ainda falta confirmar: se a persistência
  (bank write de 48 bytes em `0x05 @ 0x0000`) aplica após trocar de preset ou
  após power cycle. O comando `0x50` continua recusado (`0x01`), e o register
  write `0x24` também é recusado até pelo CubeSuite (pista falsa — o fluxo
  oficial usa só `0x22`). Ver a seção da spec antes de continuar os testes.
- **O binário do CubeSuite não está stripped — use-o antes de adivinhar.**
  `/Applications/CubeSuite.app/Contents/MacOS/CubeSuite` (x86_64) traz os
  símbolos C++ inteiros de `CUSBConnect`. `nm -C` lista a API, e `objdump -d`
  dá o algoritmo. Foi assim que saíram o checksum, o empacotamento de 7 bits, a
  semântica do ACK e o formato do IR — tudo sem arriscar comando no hardware.
  Gere o disassembly uma vez pro scratchpad (~1,6 s, 528k linhas) e consulte com
  `grep`. **Testar hipótese no pedal é o último recurso, não o primeiro.**

## O que ainda é incerto (não trate como fato)

- **Os ranges dos parâmetros no `packages/profiles`** (gain 0–7, tone 0–15…)
  vieram de fonte comunitária, **não do manual**. O dump dos presets de fábrica
  não contradisse nenhum deles, mas também não exercitou os extremos — continue
  tratando como provisório. Os nomes de preamp/gabinete saíram do manual oficial
  e estão corretos.
- ~~**Se o byte `type` é 0-based ou 1-based**~~ — **resolvido**: é 0-based. No
  dump, o preset A tem `type=7` (Wo Stone Coral OD) e `cab=4` (VHT), exatamente
  os índices do profile.
- **Onde ficam os parâmetros ao vivo.** O `0x05 0x80000000+` que o cuvave-midi
  documenta lê só zeros e **não aparece no binário do CubeSuite**. O caminho de
  RAM do software oficial é o bank `0x04`. Ver a ressalva na spec.

## Estado atual

Funciona hoje, em modo demo (sem pedal): editor de presets com knobs, geração
por IA (1 preset por vez, com biblioteca e playlists), login Google opcional e
sincronização no Firestore.

- **No ar:** https://cuvave-studio.web.app (projeto Firebase `cuvave-studio`)
- **Falta 1 passo manual:** ativar o provedor Google em Authentication no
  console do Firebase. Sem isso o botão "Entrar" não funciona.
- **Roadmap:** o **M1 fechou** (15/08/2026): codec implementado e testado,
  leitura de presets funcionando, formato do IR resolvido. Em 16/08 a escrita
  viva de parâmetros foi confirmada com mudança de áudio (~20 dB) — falta
  confirmar a persistência do bank write. O próximo é o **M2** — ligar o app
  ao pedal —, e o M3 já tem alvo conhecido.
- **A bancada de testes** vive em `apps/web/bancada.html` + `src/bancada.ts`,
  fora do build de produção. Abre em `localhost:5173/bancada.html` e serve pra
  qualquer diagnóstico novo com o pedal: conecta, lê presets, faz diff de knobs,
  mede áudio pela interface USB do próprio pedal e restaura os presets de
  fábrica. Reaproveite em vez de improvisar no console.

## Como trabalhar aqui

- **Idioma: português do Brasil**, inclusive em comentários e mensagens de
  commit.
- **Commits direto na `main`**, sem branch e sem PR.
- `npm run dev` (porta 5173) · `npm run build` · `npm test` (vitest) ·
  `npm run deploy` (build + Firebase Hosting).
- **O protocolo tem teste e os vetores são reais.** `packages/protocol` é
  validado contra frames capturados do pedal e contra o algoritmo do binário
  oficial. Mexeu no codec, rode `npm test` — não confie em inspeção visual.
- **Outra IA (DeepSeek) trabalha neste mesmo repositório.** Antes de editar,
  confira `git log` e `git status` — arquivos podem ter mudado desde a última
  sessão. Em caso de conflito de edição simultânea, alinhe antes de sobrescrever.
- **Verifique o que você afirma.** Este projeto já teve erro de fato caro
  (afirmar que o CubeSuite era Windows-only sem checar — ele roda no Mac). Se
  for dizer que algo funciona, rode; se for citar o manual, leia o PDF; se for
  medir, meça.
