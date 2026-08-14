# SPEC — Cuvave Studio (v0.1)

Web app (Chrome/Edge) para pedaleiras da família **Cuvave/M-VAVE**, com geração
de presets por IA.

## Natureza do projeto (não é um produto)

**Isto não é um produto comercial.** É uma ferramenta pessoal, feita para uso
próprio e para compartilhar com alguns amigos — sem venda, sem assinatura, sem
monetização, sem lojas de aplicativos.

Distribuição:

- **Um link** (Firebase Hosting). Nada de `.dmg`, `.exe`, `.apk`, AltStore,
  assinatura de código ou notarização — compartilhar é mandar a URL
- **Chrome ou Edge** (Chromium). O app usa Web MIDI API, que existe nesses
  navegadores em Windows, macOS e Android. Safari e Firefox estão **fora de
  escopo por decisão** — quem abrir no Safari vê uma mensagem pedindo pra
  instalar o Chrome

Implicações:

- Zero requisitos de store, zero custo de infra (Firebase Spark, plano grátis)
- iOS fica de fora (nenhum browser de iPhone fala MIDI — exigiria app nativo
  com sideloading/AltStore; não vale a fricção pra um projeto pessoal)
- Android funciona na web via Chrome + OTG — mesmo link do desktop
- "Pessoal" não significa "bagunçado" — o código segue organizado e testado

## Visão

O software original (CubeSuite) é limitado (UI antiga, Qt) e roda em
Windows e macOS (app Qt instalado em `/Applications/CubeSuite.app` — usado
como referência de engenharia reversa). Este projeto é um app web simples que
permite:

1. Editar os presets do pedal (Cube Baby: botões A/B/C; outros modelos depois)
2. Carregar IRs (Impulse Response) de cab sim
3. **Feature IA**: digitar o nome de uma música → IA gera um preset para aquela
   música e explica o porquê de cada escolha
4. Usar o mesmo software com diferentes pedais da marca (um de cada vez)

Filosofia: **v0 simples**, sem complexidade desnecessária. O foco de
refinamento posterior será na interface (user friendly, visual bonito).

## Por que web (e por que Chrome/Edge)

A dificuldade do projeto nunca foi o código — foi publicação/compartilhamento
(assinar DMG/EXE, SmartScreen, sideloading). Um app web elimina isso: um link
resolve a distribuição.

- **Web MIDI API** (`navigator.requestMIDIAccess({ sysex: true })`): padrão,
  acesso às portas MIDI USB do sistema, SysEx com permissão extra
- Suporte (caniuse, 2026): Chrome/Edge desktop ✅, Chrome Android (OTG) ✅,
  Safari ❌, Firefox 108+ ✅ (ignorado por decisão — alvo único Chromium)
- **CORS da DeepSeek liberado** — testado em 14/08/2026: `Access-Control-Allow-Origin`
  ecoa o origin, `Allow-Methods: POST`, `Allow-Headers: authorization,content-type`,
  `Allow-Credentials: true`. **Não precisa de proxy/Cloud Function** — o browser
  chama `api.deepseek.com` direto
- Se a Web MIDI falhar na validação com o pedal (M1), o plano B documentado é
  embrulhar o mesmo core num Electron (`@julusian/midi`) — mas a aposta é na web

## O que já sabemos do protocolo (engenharia reversa)

Fonte: [pferreir/cuvave-midi](https://github.com/pferreir/cuvave-midi) (Rust, GPL-3) — memória e comandos
Referência de framing: [mvave-chocolate-sysex](https://github.com/cbix/mvave-chocolate-sysex)
Referência local: **CubeSuite.app** (Qt, `/Applications/CubeSuite.app`) — o app oficial instalado
no Mac, usado como oráculo de engenharia reversa

- O pedal é um dispositivo **USB MIDI class-compliant** (SysEx)
- Confirmado pelo CubeSuite no macOS: usa **CoreMIDI** (`MidiInCore`/`MidiOutCore`), sem driver
- Strings do binário confirmam o protocolo: o fluxo de upload espera resposta com tipo `0x23`
  (dados de leitura) ou **`0x30`** (`"get_upload_responds::Data type not 0x30!"` — provável ACK
  de escrita/erase, ainda não mapeado no cuvave-midi), validação de checksum, fluxo de erase
- O CubeSuite é multi-dispositivo (Cube Baby, Baby Bass, Cube Baby AC, Looper, Synth,
  Micro…) — mesma ideia da arquitetura de profiles deste projeto
- Frame SysEx: `F0 ... F7`, com codificação interna "bit-shift" de 7 bits
- Frame decodificado: header `00 59` + tipo (1B) + tamanho LE (3B) + conteúdo + checksum
- Comandos: `Init` (0x00), `NameVersion` (0x11), `Erase` (0x21),
  `WriteMemory` (0x22), `ReadMemory` (0x23)

### Mapa de memória

| Endereço | Conteúdo |
|---|---|
| `0x05 0x0000–0x002C` | Settings/presets (3 × 13 bytes, offset 0x10 por preset) |
| `0x00 0x3000` | USB loopback |
| `0x04 0x0764` | Flag IR utilizável |
| `0x04 0x0768` | IR Distance (f32) — distância do microfone (100% = silêncio) |
| `0x04 0x076C–0x0F68` | IR Data (RAM) |
| `0x00 0x69000–0x71000` | IR Data (ROM) |
| `0x05 0x80000000+` | Escrita de parâmetro ao vivo (RAM) |

### Estrutura de cada preset (13 bytes)

```
type, gain, tone, reverb, feedback, volume, time, mix,
modulation, cabinet, ir_section, delay_section, tone_section
```

- `type` seleciona o efeito; os demais parâmetros mudam de significado conforme o tipo
- Presets: A = 0x00, B = 0x10, C = 0x20

### Detalhes do hardware (manual oficial)

- **Cadeia de efeitos**: `Tuner → Preamp → Phaser/Chorus → Delay → Reverb → IR CAB`
- **Módulos por footswitch**: C = AMP (type/gain/tone), B = MOD + DELAY, A = IR CAB + REVERB
- **Semântica de "off"**: MIX no mínimo = delay off; REVERB no mínimo = reverb off; MOD no meio (7–8) = mod off
- **BT é só áudio** (playback de música) — não existe config por Bluetooth; o USB é o único caminho de dados
- **Três modos**: PRESET (knobs não editam, só volume final), LIVE (tudo WYSIWYG) e
  EDIT (edita os 3 presets) — salvamento é long-press no footswitch A/B/C. Isso
  explica o mapa de memória ter área de **parâmetro ao vivo** (`0x05 0x80000000+`)
  separada da área dos presets (`0x05 0x0000–0x002C`)
- **Semântica de save do CubeSuite**: edição em tempo real só funciona quando o
  software e o pedal estão no mesmo preset (o software escreve na área ao vivo);
  sem clicar em salvar, desligar o pedal restaura os valores anteriores — confirma
  as duas camadas: RAM ao vivo vs área persistida dos presets

#### Preamps (TYPE, 9 slots)

| Valor | Referência | Tipo |
|---|---|---|
| 0 | Power-Zone Clean | clean |
| 1 | US Gold 100 Clean | clean |
| 2 | Two Stone Coral OD | overdrive |
| 3 | Doctor3 B | overdrive |
| 4 | Cali JP A | overdrive |
| 5 | Day Tripper OD | distortion |
| 6 | Shittcow Dist | distortion |
| 7 | Wo Stone Coral OD | distortion |
| 8 | Mr Smith Dist | distortion |

#### MOD

| Range | Efeito |
|---|---|
| 0–6 | Chorus |
| 7–8 | Desligado |
| 9–15 | Phaser |

#### IR CAB (slots)

| Slot | Cab sim |
|---|---|
| 1 | IR desligado |
| 2 | Line 6 Vetta (1×12) |
| 3 | Marshall 1960AV (4×12) |
| 4 | Marshall 1960A T75 La610 (4×12) |
| 5 | VHT Deliverance (2×12) |
| 6 | Soldano (2×12) |
| 7 | Peavey 5150 + Mesa Oversized (4×12) |
| 8 | JSX KT77 + Mesa Stiletto AKG C1000 (4×12) |
| 9 | Diezel V30 SM57 (Soldano HR PowerAmp) (4×12) |

#### IR (arquivo)

- Amostragem do pedal: **48kHz/24bit**
- 8 posições de IR; importar sobrescreve o slot escolhido
- **IR Distance** (f32 em `0x04 0x0768`): simulador de distância do microfone — mais perto = mais alto; 100% = silêncio

#### Presets de fábrica

- A: Wo Stone Coral OD + DELAY + REVERB + VHT Deliverance 2×12 (distortion)
- B: Cali JP A + DELAY + REVERB + Soldano 2×12 V30 (overdrive)
- C: US Gold 100 Clean + CHORUS + DELAY + REVERB + Marshall 1960A T75 LA610 (clean)

## Suporte ao Tank-G (futuro)

Cuvave = M-VAVE (mesma empresa). O Tank-G usa a mesma família de protocolo
(framing SysEx `F0 00 32 ... F7` + base-128), e o manual confirma transmissão
de dados por USB ("computer software can be connected for interactive data
transmission"). É um dispositivo de classe diferente do Cube Baby — mapa de
memória próprio.

### O que o manual já nos dá

- **36 presets** (9 banks × A/B/C/D), cadeia customizável
- Cadeia: `Tuner → Noise Gate → Preamp → EQ 3 bandas → MOD → DELAY → REVERB → IR CAB`
- Footswitches no LIVE: A = REVERB, B = DELAY, C = MOD, D = AMP
- Knobs "3 processos": MOD FX (chorus/phaser/tremolo), DLY MIX (analog/tape/dual),
  RVB DECAY (room/spring/cloud); meio entre processos = módulo off
- **IR**: `44.1kHz/24bit MONO WAV, 1024 pontos` — formato diferente do Cube Baby (48kHz)
- IR CAB: slot 0 = off; slots 1–8 = VHT Deliverance 4×12, Sperimental 4×12,
  Electrovoice 2×10, Mesa Boogie 4×12, Fender Champ 1×8, Fender Pr Junior 1×10,
  Marshall 1960V30 4×12, Diezel V30 4×12
- Preamps (9): UWE-Twins 335 / Archetype_C_W (clean); TH-Mars VM410 / Friedman 100 /
  Brit Plex 50 (overdrive); Mars FD Hundred / Pea V 534 / Diesel_Hagan_6 /
  EVH 5150 III EL34 (dist)
- BT oficial do app controla parâmetros (GATT) — plano B apenas; se o USB
  funcionar como MIDI, não precisamos de BLE
- Loopback do sound card: ligado de fábrica, configurável via software
  (o Cube Baby tem endereço equivalente no mapa: `0x00 0x3000` USB loopback)

### Complexidade (gate de decisão)

1. **USB SysEx class-compliant confirmado** → complexidade **baixa**: core
   compartilhado (framing/checksum/codec); falta só o profile `tank-g`
   (schema de parâmetros + mapa de memória via dump) — mesma rotina do M1
2. **USB não responder como MIDI** → BLE vira obrigatório (GATT vendor, recon do
   ha-mvave-tankg) e a complexidade sobe para média/alta

Referências:
- [ha-mvave-tankg](https://github.com/hudsonbrendon/ha-mvave-tankg) — recon BLE (plano B)
- [mvave-blackbox-ble](https://github.com/jvsobrinho/mvave-blackbox-ble) — USB SysEx do Blackbox (indício forte de que o USB do Tank-G funciona)

O que falta quando o pedal for comprado:
1. Verificar MIDI USB class-compliant (desktop e OTG)
2. Mapear memória/parâmetros (36 presets, cadeia de efeitos) via dump
3. Escrever o profile `tank-g` — UI e IA reaproveitam

A IA funciona igual: o system prompt passa a descrever a cadeia do Tank-G
(preamps/mod/delay/reverb) e o schema de saída reflete o profile ativo.

## Incógnitas (validar com o pedal na mão)

1. Confirmação byte ↔ knob: nomes dos preamps são conhecidos (tabela acima); falta confirmar se o byte `type` = posição do knob (0–8) e o layout exato dos 13 bytes
2. Intervalos de cada parâmetro por efeito (MOD 0–15 e ranges dos knobs mapeados; falta confirmar no dump de memória)
3. Formato exato do IR: amostragem é 48kHz/24bit; falta a conversão WAV → f32 do pedal
4. ~~macOS reconhece o pedal como MIDI sem driver~~ — **resolvido**: CubeSuite usa CoreMIDI no Mac
5. **O pedal aparece no Web MIDI do Chrome?** (desktop e Android/OTG) — primeiro teste do M1,
   assim que o pedal chegar: `navigator.requestMIDIAccess({ sysex: true })` no console
   e conferir se o Cube Baby está na lista de outputs
6. Tipo de resposta `0x30` no fluxo de upload (ACK de escrita/erase?) — mapear no dump
7. Windows reconhece o pedal via Web MIDI em Chrome — suportado pelo Chromium
   (class-compliant USB MIDI nativo), mas validar com um amigo no primeiro build
   (é a plataforma real dos amigos; só o desenvolvedor usa Mac)

Plano: ao conectar o pedal, fazer dump de memória (ReadMemory) e comparar com o
app original para mapear os efeitos. O CubeSuite instalado no Mac acelera isso:
basta capturar o tráfego MIDI dele (CoreMIDI) ou comparar os blobs de fábrica
(`Resources/bin/*.bin`) com os valores lidos do pedal.

## Escopo MVP (v0)

- Conectar/detectar o pedal via Web MIDI (lista de dispositivos)
- Ler/escrever os 3 presets (editor de parâmetros)
- Enviar IR (arquivo WAV) ao pedal
- **IA**: nome da música → JSON estruturado com 3 presets (A/B/C) + explicação
- Salvar/carregar presets localmente (localStorage/IndexedDB)
  **Nota**: até o M6, presets vivem só no perfil daquele navegador — trocar de
  máquina, limpar dados ou usar outro perfil do Chrome perde tudo. Sincronização
  na nuvem chega no M6 (Firestore)
- Config local: API key DeepSeek do próprio usuário (nunca embutida no código)

## Fora de escopo (v0 = M1–M5)

- Edição de efeitos em tempo real contínuo
- Compartilhamento comunitário de presets (fora do v0; entra no M6 com Firebase)
- Atualização de firmware
- Safari/Firefox (Chrome/Edge apenas — decisão tomada)
- iOS (sem Web MIDI; exigiria app nativo + AltStore)
- Electron/desktop nativo (plano B documentado se a Web MIDI falhar)
- Backend próprio (Firebase cobre o que precisar)

## Arquitetura (web + Firebase)

```
Monorepo TypeScript
 ├─ packages/protocol     ← core compartilhado (framing, checksum, codec)
 ├─ packages/profiles     ← perfis de dispositivo (JSON/TS)
 └─ apps/web (React + Vite + TS)
      ├─ Transporte: Web MIDI API (requestMIDIAccess, sysex: true)
      ├─ IA: HTTP direto → api.deepseek.com (CORS liberado, key do usuário)
      ├─ Firebase: Hosting (deploy = link) + Auth + Firestore (presets) + Storage (IRs)
      └─ Local: presets/keys em localStorage/IndexedDB
```

- Um código-base único: roda no Chrome/Edge de Windows, macOS e Android (OTG)
- Flows: `nome da música → LLM → JSON validado → SysEx → pedal`
- Um dispositivo ativo por vez (seleção no app; nunca os dois simultâneos)
- **Core compartilhado**: protocolo (framing `F0 00 32 ... F7`, base-128,
  checksum) e perfis de dispositivo são TypeScript puro — rodam no browser (Vite)
  e em qualquer wrapper futuro (Electron, se o plano B for acionado)
- **Firebase (Spark, grátis)**: Hosting + Auth (login pra sincronizar/compartilhar)
  + Firestore (presets por usuário) + Storage (arquivos de IR). **Sem Cloud
  Functions** — a DeepSeek aceita chamada direta do browser (CORS testado), então
  cada usuário usa a própria key e não existe proxy nem plano pago (Blaze)

### Perfis de dispositivo (Device Profiles)

Cada pedal = um profile declarativo. O restante do app (UI, IA, bibliotecas) é
compartilhado. Adicionar um novo pedal = escrever um profile novo, sem mexer no core.

```ts
interface DeviceProfile {
  id: string                 // ex: "cube-baby", "tank-g"
  name: string
  transport: "usb-midi"
  detect: { name?: RegExp }  // como identificar o dispositivo na lista MIDI
  memoryMap: { ... }         // endereços (settings, IR, presets...)
  parameters: Parameter[]    // schema: nomes, ranges, tipos
  irFormat: { ... }          // conversão WAV → formato do pedal
  buildSysEx(preset): SysEx  // conversor de preset → mensagens
}
```

O profile descreve: número de presets, cadeia de efeitos, parâmetros com ranges,
endereçamento de memória e conversão de IR. O protocolo de transporte
(framing `F0 00 32 ... F7`, base-128, checksum) é compartilhado — família Cuvave/M-VAVE.

## Especificação da IA

- **Provedor**: DeepSeek API (`api.deepseek.com/chat/completions`, modelo `deepseek-chat`)
- **Chamada direta do browser** — CORS liberado (testado: allow-origin ecoa o
  origin, POST, headers authorization/content-type). Sem proxy
- **API key**: cada usuário cola a própria key no app; fica no localStorage
  até o M6. Se passar pro perfil do Firestore, exigirá **Security Rules** que
  garantam que cada usuário só lê/escreve o próprio documento — a key de um
  amigo nunca pode ficar visível pros outros (nunca embutida no código)
- **Entrada**: nome da música (+ opcional: estilo/dica do usuário)
- **Saída** (JSON estruturado, schema fixo):

```json
{
  "presets": {
    "a": { "type": 4, "gain": 70, "tone": 55, "...": "..." },
    "b": { "...": "..." },
    "c": { "...": "..." }
  },
  "explanation": "Drive Plexi com gain médio porque a música usa crunch vintage..."
}
```

- **System prompt** descreve a cadeia de efeitos do pedal + intervalos de parâmetros
- **Camada de validação**: clampa valores, valida schema, converte para SysEx
- Erros da IA nunca chegam ao pedal sem validação
- Risco real: "nome de música → parâmetros" é subjetivo — iterar o system prompt
  cedo, com few-shot por gênero

## Roadmap

1. **M1** — Validar protocolo com hardware (pedal chega: Web MIDI no Chrome,
   dump de memória, mapear `type` ↔ efeitos, confirmar incógnitas)
2. **M2** — Camada MIDI (core protocolo + Web MIDI) + editor manual dos 3 presets
   + primeiro deploy no Firebase Hosting (link pros amigos testarem no Windows)
3. **M3** — Envio de IRs
4. **M4** — Gerador de presets por IA (DeepSeek direto do browser)
5. **M5** — Refino de UI/UX (foco: simples, bonito, user friendly)
6. **M6** — Firebase Auth + Firestore: presets na nuvem, sincronização e
   compartilhamento com amigos (Security Rules: cada usuário só lê/escreve os
   próprios dados; a key da DeepSeek, se for pro Firestore, fica protegida por
   essas mesmas regras)
7. **M7** — Profile do Tank-G (gate: USB SysEx confirmado; senão, avaliar BLE)

A arquitetura de profiles é preparada desde o M2 — um pedal novo entra como um
profile, sem refatoração do core. O alvo é um único link web (Chrome/Edge).
O Tank-G (M7) entra como profile novo se o gate do USB for confirmado.
iOS nativo fica fora do roadmap — só se um dia fizer muito sentido.

## Decisões já tomadas

| Tema | Decisão |
|---|---|
| Stack | Web app: React + Vite + TypeScript (sem Electron) |
| Navegador | Chrome/Edge (Chromium) apenas — Safari/Firefox fora por decisão |
| MIDI | Web MIDI API (`requestMIDIAccess({ sysex: true })`) |
| IA | DeepSeek API chamada direta do browser (CORS testado); key do próprio usuário |
| Infra | Firebase Hosting + Auth + Firestore + Storage (Spark grátis, sem Cloud Functions) |
| Escopo | v0 enxuto (Cube Baby); UI refinada depois |
| Multi-dispositivo | Arquitetura de profiles desde o início; Tank-G = profile novo no M7 (gate USB) |
| Mobile | Android via Chrome/OTG (mesmo link); iOS fora (sem Web MIDI) |
| Plano B | Se Web MIDI falhar no M1: embrulhar o core num Electron (@julusian/midi) |
| Licença/referência | Protocolo baseado em cuvave-midi (GPL-3) — reimplementação própria |
