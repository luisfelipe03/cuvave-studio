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
Referência de terceiros (MIT): [MrGariZack/cubecontrol](https://github.com/MrGariZack/cubecontrol) —
biblioteca de protocolo + CLI com o "save path" do CubeSuite (handshake + escrita do bank inteiro +
register write 0x24) e o formato do IR ROM; [MrGariZack/cubecontrol-app](https://github.com/MrGariZack/cubecontrol-app) —
editor desktop Electron/RtMidi. MIT é compatível com nosso GPL-3 se quisermos reaproveitar código

- O pedal é um dispositivo **USB MIDI class-compliant** (SysEx)
- Confirmado pelo CubeSuite no macOS: usa **CoreMIDI** (`MidiInCore`/`MidiOutCore`), sem driver
- Strings do binário confirmam o protocolo: o fluxo de upload espera resposta com tipo `0x23`
  (dados de leitura) ou **`0x30`** (`"get_upload_responds::Data type not 0x30!"` — provável ACK
  de escrita/erase, ainda não mapeado no cuvave-midi), validação de checksum, fluxo de erase
- **Confirmado no hardware (14/08/2026)**: o pedido NameVersion respondeu com checksum válido.
  Nome do dispositivo: `SINCO-CubeBaby` (19 bytes de nome + mistério: `01 13 14 15 16 17 18 19`,
  8 bytes de significado ainda desconhecido — provável versão de firmware). No Web MIDI do
  Chrome o pedal aparece com nome genérico **"USB2.0 Device"** — a detecção não pode confiar
  só no nome
- **WriteMemory responde ACK** (observado no pedal): tipo `0x00`, tamanho 1, conteúdo `0x00`.
  **O `0x00` é sucesso** — não é erro: `CUSBConnect::make_responds_packet(buf, ok)` no binário
  escreve `0` quando `ok` é verdadeiro e `1` quando é falso. A nomenclatura `ACK(false)` do
  cuvave-midi induz ao erro; a confirmação auditiva continua valendo a pena, mas o protocolo
  já diz que o pedal aceitou o comando
- O CubeSuite é multi-dispositivo (Cube Baby, Baby Bass, Cube Baby AC, Looper, Synth,
  Micro…) — mesma ideia da arquitetura de profiles deste projeto
- Frame decodificado: header `00 59` + tipo (1B) + tamanho LE (3B) + conteúdo + checksum
- Comandos: `Init` (0x00), `NameVersion` (0x11), `Erase` (0x21),
  `WriteMemory` (0x22), `ReadMemory` (0x23)

#### Codec (confirmado no binário — implementado em `packages/protocol`)

O binário do CubeSuite **não está stripped**: tem os símbolos C++ de
`CUSBConnect` inteiros, o que dispensa adivinhação. Três achados fecham o codec:

- **Checksum** (`CUSBConnect::add_checksum`): soma os bytes **só do conteúdo**
  (header, tipo e tamanho ficam de fora), com wrap de 8 bits, e devolve o
  complemento (`sum ^ 0xFF`). Confere com os dois frames reais lidos do pedal:
  conteúdo `00` → `FF`; conteúdo somando `0xB2` → `4D`
- **Header** (`s_arrSysexHead`, lido de `__DATA,__data`): os literais `00 59`
- **Empacotamento** (`u8ToMidi`): bitstream **little-endian de 7 bits** — acumula
  bits do LSB pra cima e emite grupos de 7 —, embrulhado entre `F0` e `F7`.
  **Não existe manufacturer ID**: o `00 32` que a documentação da comunidade
  descreve como ID de fabricante é o header `00 59` já empacotado (`0x00` sai
  como `00`; `0x59 << 1 = 0xB2`, e `0xB2 & 0x7F = 0x32`). Isso está coberto por
  teste
- **ACK** (`make_responds_packet(buf, ok)`): frame tipo `0x00`, tamanho 1,
  conteúdo `ok ? 0x00 : 0x01`

#### Fluxo de escrita (do `CCubeBabyIREditDlg::OnSave`)

Gravar na área persistente **não é só mandar WriteMemory**. A sequência oficial é:

1. `flash_erase(tipo, endereço)` — obrigatório antes de gravar
2. `Sleep(100)` — 100 ms de espera depois do erase
3. `flash_write(...)` seguido de `flash_read(...)` conferindo o que foi gravado
   (é isso que `write_and_verify` faz)

Já a área de RAM (`fx_ctrl_panel_write`) **não faz erase** — escreve direto.
Isso explica por que comandos disparados em sequência, sem intervalo, perdem a
resposta: o pedal está ocupado com o erase.

#### Escrever parâmetro não muda o som (REABERTO em 16/08/2026)

**Histórico:** em 15/08, uma manhã de testes mediu ≤1 dB de variação escrevendo
em todos os caminhos (live `0x80000005`, persistente, float no bank 0x04,
`save_0`, troca de preset) e concluiu que o DSP não aplica parâmetros — reforçado
pelo binário (`write_Effect`/`OnSaveEffect` só existem nas dialogs AC/Jun).

**MAS em 16/08 o reteste mediu mudança clara:** com os presets restaurados de
fábrica e o preset A selecionado no footswitch, escrever volume=0x05 no endereço
vivo `0x05 @ 0x80000005` **derrubou o nível em ~20 dB** (RMS 0.0029 → 0.0003,
medido pela interface de áudio USB do pedal) e a restauração trouxe de volta
(0.0039). O ACK foi `0x00` em todas as operações.

O que provavelmente invalidou o teste de 15/08: o pedal estava em bypass ou
num estado pós-experimentos onde o DSP não lia a área viva. **Lição:** sempre
selecionar o preset no footswitch antes de medir.

Pendências pra fechar:

1. **Persistência sem live write**: escrever só o bank (48B) e trocar de preset
   no footswitch (A→B→A) — o DSP recarrega do bank?
2. **Persistência com power cycle**: escrever só o bank e desligar/ligar o pedal
3. Se (1) ou (2) aplicarem, o fluxo completo do app é: editar ao vivo → salvar
   (bank write) → aplicado de imediato ou após troca/boot

Consequência prática: **a edição de parâmetros ao vivo FUNCIONA neste modelo** —
o app ganha o editor em tempo real; falta confirmar a persistência.

**Informação nova (16/08/2026) — vale UM reteste.** O projeto
[MrGariZack/cubecontrol](https://github.com/MrGariZack/cubecontrol) documenta o
"save path" do CubeSuite com três elementos que **não foram testados** na
investigação original:

1. **Handshake antes de cada operação**: pedido de identidade (`0x11` vazio) +
   80 ms de espera antes de escrever/ler
2. **Escrita do bank inteiro (48 bytes)**, não de bytes avulsos: ler bank →
   escrever 1 byte vivo → escrever os 48 bytes do bank → reler pra conferir
3. **Register write `0x24`** (`content = memory(1) + addr LE32 + value LE32`):
   é o "Mystery1/2" do cuvave-midi — escreve registradores do DSP (flag de IR em
   `0x04 @ 0x0764` e distância do microfone em `0x04 @ 0x0768`). A distância é
   audível por definição (100% = silêncio), então esse teste confirma se o
   caminho de registro chega no DSP

Atenção ao detalhe: o projeto deles interpreta o ACK ao contrário
(`accepted = rawValue > 0`); a nossa evidência (binário `make_responds_packet`
+ escrita que gravou com ACK `0x00`) diz `0x00` = sucesso.

**Capturas reais do tráfego do CubeSuite** (fixtures do repo deles, decodificadas
com o nosso codec — startup de 2026-08-09):

- **Startup**: `0x11` vazio → resposta; lê `0x00 @ 0x2100` (20 bytes); envia
  **`0x12` vazio** (comando desconhecido — resposta de 6 bytes!); lê o bank
  (`0x05 @ 0x0000`, **48 bytes**); lê `0x00 @ 0x3000` (loopback)
- **Save**: WriteMemory live `0x05 @ 0x80000005` (volume=0x64, 1 byte) → ACK 00 →
  WriteMemory do **bank inteiro de 48 bytes** em `0x05 @ 0x0000` → ACK 00 →
  relê 48 bytes pra conferir. Sem erase
- **Edição de parâmetro** (gain): stream de writes vivos de 1 byte em
  `0x80000001`, cada um com ACK 00

Ou seja: o `0x12` (talvez "entrar em modo remoto") e a **escrita do bank
inteiro** são os dois caminhos que a gente nunca tentou. Reteste pendente
(sequência exata abaixo).

**Testado no pedal (16/08/2026)**: `0x12` vazio responde `01 00 00 00 00 00`
(6 bytes) — o comando existe e o firmware o aceita, mas o significado segue
desconhecido (o decoder do projeto deles também o trata como `unknown`).
Provável consulta de estado/modo.

### Mapa de memória

| Endereço | Conteúdo |
|---|---|
| `0x05 0x0000–0x002C` | Settings/presets (3 × 13 bytes, offset 0x10 por preset) |
| `0x00 0x3000` | USB loopback |
| `0x04 0x0764` | Flag IR utilizável |
| `0x04 0x0768` | IR Distance (f32) — distância do microfone (100% = silêncio) |
| `0x04 0x076C–0x0F68` | IR Data (RAM) |
| `0x00 0x69000–0x71000` | IR Data (ROM) |
| `0x05 0x80000000+` | Escrita de parâmetro ao vivo (RAM) — **lê zeros** (write-only; o pedal aplica ao DSP mas não devolve leitura útil) |

O primeiro byte de cada comando é o bank (`EFlashType` no CubeSuite).
`fx_ctrl_panel_write` — o caminho que o software oficial usa pra RAM, incluindo
todo o envio de IR — chama `flash_write_and_verify` com o tipo **fixo em 4**,
que é o mesmo bank `0x04` das linhas de IR acima.

**Ressalva sobre o `0x05 0x80000000+`**: esse endereço vem do cuvave-midi
(comunidade), **não do binário oficial** — não há uma única referência a
`0x80000000` no CubeSuite, e a única dialog de Cube Baby que ele tem
(`CCubeBabyIREditDlg`) só edita IR, nunca os parâmetros do preset. Então "lê
zeros" pode significar write-only, mas também pode significar que não é ali que
o firmware guarda os parâmetros ao vivo.

### Estrutura de cada preset (13 bytes)

```
type, gain, tone, reverb, feedback, volume, time, mix,
modulation, cabinet, ir_section, delay_section, tone_section
```

- `type` seleciona o efeito; os demais parâmetros mudam de significado conforme o tipo
- Presets: A = 0x00, B = 0x10, C = 0x20 — **stride de 16 bytes**: 13 usados + 3 de
  padding (`00 00 00`), confirmado no dump real (14/08/2026)
- **Confirmado no hardware**: a ordem dos bytes acima bate com o dump dos presets
  de fábrica (ver abaixo) — o range de cada parâmetro bate com o schema do app
- **Sections são o on/off real**: `delay_section`/`ir_section`/`tone_section` são os
  flags do módulo; valor mínimo do knob (ex: `mix=0`) não significa módulo off —
  o preset A de fábrica tem `mix=0` com `delay_section=1`. A UI da cadeia deve
  ler os flags, não inferir dos valores

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

**Formato exato do que vai pro pedal** (de `CCubeBabyIREditDlg::send_core_data`,
no binário): o pedal **não recebe WAV**. Recebe **512 amostras `float32`**, e o
envio é um bloco único de **2052 bytes** (`0x804`) começando em `0x04 0x0768`:

```
[0x0768] distância (float32)
[0x076C] 512 × float32  ← a IR propriamente dita (2048 bytes)
```

A sequência que o software oficial faz:

1. `fx_ctrl_panel_write(0x764, [0x00], 1)` — **desliga** a flag de IR
2. `fx_ctrl_panel_write(0x768, buffer, 0x804)` — manda distância + 512 floats
3. `fx_ctrl_panel_write(0x764, [0x01], 1)` — **religa** a flag

Ou seja, a conversão que falta no M3 é: WAV 48kHz → 512 taps `float32`. Isso
resolve a incógnita 3 (era "falta a conversão WAV → formato do pedal").

#### Presets de fábrica (dump real, 14/08/2026)

Valores lidos do pedal por ReadMemory (0x05 @ 0x0000, 45 bytes) — o manual
descreve os mesmos presets; o firmware é a verdade quando divergir:

```
A: 07 07 09 05 34 41 14 00 07 04 01 01 01   Wo Stone Coral OD + VHT ✓
B: 04 02 05 05 2c 46 17 1e 07 05 01 01 01   Cali JP A + Soldano ✓
C: 01 07 07 05 34 6f 14 0c 05 02 01 01 01   US Gold Clean + chorus + Marshall 1960AV
```

- A: type=7, gain=7, tone=9, reverb=5, fb=52, vol=65, time=20, mix=0, mod=7(off), cab=4(VHT)
- B: type=4, gain=2, tone=5, reverb=5, fb=44, vol=70, time=23, mix=30, mod=7(off), cab=5(Soldano)
- C: type=1, gain=7, tone=7, reverb=5, fb=52, vol=111, time=20, mix=12, mod=5(chorus), cab=2(Marshall 1960AV)
- Divergência com o manual: o manual diz que C usa Marshall 1960A T75 (índice 3);
  o pedal usa índice 2 (Marshall 1960AV)
- Os 3 flags de seção ficam `01 01 01` nos três presets de fábrica
- Nota 16/08: após reset de fábrica (pelo usuário), o preset A voltou com
  `mix=0x1e` (30) em vez de `0x00` — o reset oficial escreve mix=30 no A

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
3. ~~Formato exato do IR~~ — **resolvido no binário**: 512 amostras `float32`
   precedidas da distância (bloco de `0x804` bytes em `0x04 0x0768`), com a flag
   `0x764` desligada durante o envio. Falta só escrever o conversor WAV → 512 taps
4. ~~macOS reconhece o pedal como MIDI sem driver~~ — **resolvido**: CubeSuite usa CoreMIDI no Mac
5. ~~O pedal aparece no Web MIDI do Chrome?~~ — **resolvido no desktop** (14/08/2026):
   aparece como "USB2.0 Device" e respondeu NameVersion com checksum válido.
   Falta confirmar Android/OTG
6. Tipo de resposta `0x30` no fluxo de upload (ACK de escrita/erase?) — ainda sem
   explicação. O que o pedal responde a WriteMemory é tipo `0x00` com conteúdo
   `0x00`, e isso já está entendido (é sucesso); o `0x30` aparece só no
   `get_upload_responds`, um fluxo que ainda não exercitamos
8. **Onde ficam os parâmetros ao vivo**: o `0x05 0x80000000+` do cuvave-midi lê
   zeros e não existe no binário oficial. O caminho de RAM que o CubeSuite usa é
   o bank `0x04` (`fx_ctrl_panel_write`), mas os offsets dos parâmetros do preset
   dentro dele são desconhecidos — o binário só mostra os de IR (`0x764`+)
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
