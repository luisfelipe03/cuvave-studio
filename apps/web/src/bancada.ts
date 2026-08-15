/**
 * Bancada de testes do M1 — ferramenta de diagnóstico, não faz parte do app.
 *
 * Abra `http://localhost:5173/bancada.html` com `npm run dev`. Cada cenário é
 * um clique; o log de tudo que entra e sai fica na tela e pode ser copiado.
 *
 * Usa o codec de `packages/protocol` — o mesmo que tem teste. Se um cenário
 * falhar, o problema é o protocolo ou o pedal, nunca uma cópia divergente.
 *
 * Nenhum cenário aqui apaga nada: só leitura e escrita em RAM (que o pedal
 * esquece quando desliga). Gravar em preset exige `flash_erase` e fica de fora
 * até o Felipe autorizar.
 */
import {
  Bank,
  buildSysEx,
  Cmd,
  isAck,
  modeChange,
  parseReadResponse,
  parseSysEx,
  readMemory,
  saveCommit,
  writeMemory,
} from 'protocol'
import { cubeBabyProfile } from 'profiles'

/** Ordem dos 13 bytes de um preset, confirmada no dump de fábrica. */
const CAMPOS = [
  'type',
  'gain',
  'tone',
  'reverb',
  'feedback',
  'volume',
  'time',
  'mix',
  'modulation',
  'cabinet',
  'ir_section',
  'delay_section',
  'tone_section',
] as const

/** Presets de fábrica lidos em 14/08/2026 — referência pra detectar mudança. */
const FABRICA: Record<string, number[]> = {
  A: [0x07, 0x07, 0x09, 0x05, 0x34, 0x41, 0x14, 0x00, 0x07, 0x04, 1, 1, 1],
  B: [0x04, 0x02, 0x05, 0x05, 0x2c, 0x46, 0x17, 0x1e, 0x07, 0x05, 1, 1, 1],
  C: [0x01, 0x07, 0x07, 0x05, 0x34, 0x6f, 0x14, 0x0c, 0x05, 0x02, 1, 1, 1],
}

const SLOTS = [
  { nome: 'A', offset: 0x00 },
  { nome: 'B', offset: 0x10 },
  { nome: 'C', offset: 0x20 },
]

const PREAMPS = cubeBabyProfile.parameters.find((p) => p.id === 'type')?.options
const CABS = cubeBabyProfile.parameters.find((p) => p.id === 'ir_cab')?.options

let entrada: MIDIInput | null = null
let saida: MIDIOutput | null = null
/** quem está esperando a próxima mensagem do pedal */
let aguardando: ((sysex: Uint8Array) => void) | null = null

const hex = (bytes: ArrayLike<number>) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')

const $ = (id: string) => document.getElementById(id)!

function log(direcao: '→' | '←' | '·' | '!', texto: string) {
  const hora = new Date().toLocaleTimeString('pt-BR', { hour12: false })
  const linha = document.createElement('div')
  linha.className = `linha ${direcao === '!' ? 'erro' : direcao === '·' ? 'nota' : 'io'}`
  linha.textContent = `${hora}  ${direcao}  ${texto}`
  $('log').appendChild(linha)
  $('log').scrollTop = $('log').scrollHeight
}

function veredito(
  cenario: string,
  estado: 'ok' | 'falhou' | 'duvida',
  texto: string,
) {
  const alvo = $(`res-${cenario}`)
  alvo.className = `resultado ${estado}`
  alvo.textContent = texto
}

/** Envia um SysEx e espera a resposta do pedal (ou desiste). */
function enviar(sysex: Uint8Array, timeout = 1500): Promise<Uint8Array> {
  if (!saida) throw new Error('nenhuma porta de saída escolhida')
  log('→', hex(sysex))
  return new Promise((resolve, reject) => {
    const relogio = setTimeout(() => {
      aguardando = null
      reject(new Error(`o pedal não respondeu em ${timeout} ms`))
    }, timeout)
    aguardando = (resposta) => {
      clearTimeout(relogio)
      resolve(resposta)
    }
    saida!.send(sysex)
  })
}

/** Pausa entre comandos — o pedal ignora rajadas (ver Sleep(100) do CubeSuite). */
const respirar = (ms = 150) => new Promise((r) => setTimeout(r, ms))

/**
 * Trava contra execuções sobrepostas.
 *
 * Sem isso, clicar de novo antes do cenário anterior terminar faz a segunda
 * execução ler como "valor original" um valor que a primeira ainda não
 * restaurou — e então restaurar para o valor errado. Foi assim que o volume do
 * preset A do Felipe acabou gravado em zero, em 15/08.
 */
let rodando = false

function aoReceber(evento: MIDIMessageEvent) {
  const dados = new Uint8Array(evento.data ?? [])
  if (dados[0] !== 0xf0) return // ignora tráfego MIDI comum
  let descricao = hex(dados)
  try {
    const frame = parseSysEx(dados)
    descricao += `\n         decodificado: tipo 0x${frame.type.toString(16)}, ${frame.content.length} bytes, checksum ok`
  } catch (erro) {
    descricao += `\n         NÃO decodificou: ${(erro as Error).message}`
  }
  log('←', descricao)
  const espera = aguardando
  aguardando = null
  espera?.(dados)
}

// ─────────────────────────────────────────────────────────── conectar

async function conectar() {
  if (typeof navigator.requestMIDIAccess !== 'function') {
    log('!', 'este navegador não tem Web MIDI — use Chrome ou Edge')
    return
  }
  log('·', 'pedindo acesso MIDI com SysEx...')
  const acesso = await navigator.requestMIDIAccess({ sysex: true })

  const saidas = [...acesso.outputs.values()]
  const entradas = [...acesso.inputs.values()]
  log('·', `portas de saída: ${saidas.map((p) => p.name).join(', ') || 'nenhuma'}`)
  log('·', `portas de entrada: ${entradas.map((p) => p.name).join(', ') || 'nenhuma'}`)

  const seletor = $('portas') as HTMLSelectElement
  seletor.replaceChildren()
  saidas.forEach((porta, i) => {
    const opcao = document.createElement('option')
    opcao.value = String(i)
    opcao.textContent = porta.name ?? `porta ${i}`
    if (cubeBabyProfile.detect.test(porta.name ?? '')) opcao.selected = true
    seletor.appendChild(opcao)
  })

  const escolher = () => {
    saida = saidas[Number(seletor.value)] ?? null
    // casa a entrada de mesmo nome; senão, a primeira disponível
    entrada =
      entradas.find((p) => p.name === saida?.name) ?? entradas[0] ?? null
    if (entrada) entrada.onmidimessage = aoReceber
    log('·', `usando saída "${saida?.name}" e entrada "${entrada?.name ?? '—'}"`)
    $('estado').textContent = saida ? `conectado: ${saida.name}` : 'sem porta'
    $('estado').className = saida ? 'estado ok' : 'estado'
    document
      .querySelectorAll<HTMLButtonElement>('button[data-cenario]')
      .forEach((b) => (b.disabled = !saida))
  }
  seletor.onchange = escolher
  escolher()
}

// ─────────────────────────────────────────────────────────── cenários

/** 1. O pedal se identifica? Prova que o codec fecha ponta a ponta. */
async function cenarioIdentidade() {
  veredito('identidade', 'duvida', 'perguntando...')
  try {
    const resposta = await enviar(buildSysEx(Cmd.NameVersion, []))
    const frame = parseSysEx(resposta)
    const texto = new TextDecoder()
      .decode(frame.content)
      .replace(/[^\x20-\x7e]/g, '')
      .trim()
    log('·', `nome do dispositivo: "${texto}"`)
    veredito(
      'identidade',
      texto.length > 0 ? 'ok' : 'duvida',
      texto.length > 0
        ? `Respondeu: ${texto} — checksum válido, o protocolo está de pé.`
        : 'Respondeu com checksum válido, mas sem texto reconhecível.',
    )
  } catch (erro) {
    veredito('identidade', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

function descreverPreset(bytes: number[]) {
  const v = Object.fromEntries(CAMPOS.map((c, i) => [c, bytes[i]]))
  const preamp = PREAMPS?.find((o) => o.value === v.type)?.label ?? '?'
  const cab = CABS?.find((o) => o.value === v.cabinet)?.label ?? '?'
  const mod =
    v.modulation <= 6
      ? 'chorus'
      : v.modulation <= 8
        ? 'mod off'
        : 'phaser'
  return `${preamp} · ${cab} · ${mod} · gain ${v.gain} · vol ${v.volume}`
}

/** 2. Ler os 3 presets e conferir com o dump de fábrica. */
async function cenarioLerPresets() {
  veredito('presets', 'duvida', 'lendo...')
  try {
    const resposta = await enviar(readMemory(Bank.Presets, 0x0000, 45))
    const { data } = parseReadResponse(parseSysEx(resposta))
    const linhas: string[] = []
    let iguais = 0
    for (const slot of SLOTS) {
      const bytes = [...data.slice(slot.offset, slot.offset + 13)]
      const igual = FABRICA[slot.nome].every((b, i) => b === bytes[i])
      if (igual) iguais++
      linhas.push(
        `${slot.nome}: ${hex(bytes)}  ${igual ? '(de fábrica)' : '(MUDOU)'}\n   ${descreverPreset(bytes)}`,
      )
    }
    log('·', linhas.join('\n'))
    veredito(
      'presets',
      'ok',
      iguais === 3
        ? 'Os 3 presets estão como vieram de fábrica. Leitura confirmada.'
        : `Leitura funcionou. ${3 - iguais} preset(s) diferente(s) do dump de 14/08 — veja o log.`,
    )
  } catch (erro) {
    veredito('presets', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

// ───────────────────────────────────────────── medição de áudio (sem guitarra)

let analisador: AnalyserNode | null = null

/**
 * O Cube Baby é interface de áudio USB, então o computador consegue ouvir o
 * pedal sozinho. Com o preset A no gain máximo e um preamp de distorção, o
 * chiado do próprio circuito já dá sinal de sobra pra medir — não precisa de
 * guitarra nem de ouvido humano.
 */
async function prepararAudio() {
  const seletor = $('audios') as HTMLSelectElement
  const escolhido = seletor.value || undefined
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: escolhido ? { exact: escolhido } : undefined,
      // qualquer processamento do navegador falsearia a medição
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
    },
  })
  const contexto = new AudioContext()
  const fonte = contexto.createMediaStreamSource(stream)
  analisador = contexto.createAnalyser()
  analisador.fftSize = 2048
  fonte.connect(analisador)
  const trilha = stream.getAudioTracks()[0]
  log('·', `ouvindo "${trilha.label}"`)
}

/** Nível médio (RMS) da entrada durante alguns instantes, em dBFS. */
function medirNivel(ms: number): Promise<number> {
  return new Promise((resolve) => {
    const buffer = new Float32Array(analisador!.fftSize)
    let soma = 0
    let amostras = 0
    const relogio = setInterval(() => {
      analisador!.getFloatTimeDomainData(buffer)
      for (const v of buffer) soma += v * v
      amostras += buffer.length
    }, 25)
    setTimeout(() => {
      clearInterval(relogio)
      const rms = Math.sqrt(soma / Math.max(amostras, 1))
      resolve(rms > 0 ? 20 * Math.log10(rms) : -Infinity)
    }, ms)
  })
}

const dB = (v: number) => (v === -Infinity ? 'silêncio total' : `${v.toFixed(1)} dB`)

async function listarEntradas() {
  // sem permissão concedida os nomes vêm vazios, então pedimos antes
  await navigator.mediaDevices.getUserMedia({ audio: true })
  const dispositivos = await navigator.mediaDevices.enumerateDevices()
  const seletor = $('audios') as HTMLSelectElement
  seletor.replaceChildren()
  dispositivos
    .filter((d) => d.kind === 'audioinput')
    .forEach((d) => {
      const opcao = document.createElement('option')
      opcao.value = d.deviceId
      opcao.textContent = d.label || 'entrada sem nome'
      // o pedal se anuncia como USB-Audio / SmartlinkTechnology
      if (/usb|smartlink|cube/i.test(d.label)) opcao.selected = true
      seletor.appendChild(opcao)
    })
  $('bloco-audio').hidden = false
  log('·', 'entradas de áudio listadas — confira se a do pedal está selecionada')
}

/** 3-B. O teste do mudo medido: o computador escuta no lugar da guitarra. */
async function cenarioMudoMedido() {
  veredito('mudo', 'duvida', 'preparando a escuta...')
  try {
    await prepararAudio()

    veredito('mudo', 'duvida', 'medindo o nível atual (2s)...')
    const antes = await medirNivel(2000)
    log('·', `nível ANTES do mudo: ${dB(antes)}`)

    if (antes === -Infinity || antes < -75) {
      veredito(
        'mudo',
        'duvida',
        `A entrada está em ${dB(antes)} — silenciosa demais pra medir. Suba o volume do pedal, confirme que ele está no preset A e tente de novo.`,
      )
      return
    }

    await enviar(writeMemory(Bank.Presets, 0x80000005, [0x00]))
    log('·', 'volume do preset A escrito como 0')
    await respirar(400)

    veredito('mudo', 'duvida', 'medindo com o volume zerado (2s)...')
    const depois = await medirNivel(2000)
    log('·', `nível DEPOIS do mudo: ${dB(depois)}`)

    const queda = antes - depois
    log('·', `queda medida: ${queda.toFixed(1)} dB`)

    await respirar(200)
    await enviar(writeMemory(Bank.Presets, 0x80000005, [0x41]))
    log('·', 'volume restaurado para 0x41 (65)')

    if (queda > 6) {
      veredito(
        'mudo',
        'ok',
        `ESCRITA CONFIRMADA. O som caiu ${queda.toFixed(1)} dB (${dB(antes)} → ${dB(depois)}) e voltou. O endereço 0x80000000 é mesmo a área viva.`,
      )
    } else {
      veredito(
        'mudo',
        'falhou',
        `O pedal aceitou o comando mas o áudio não mudou (${dB(antes)} → ${dB(depois)}, queda de ${queda.toFixed(1)} dB). Não é ali que os parâmetros vivem — rode o cenário 4.`,
      )
    }
  } catch (erro) {
    veredito('mudo', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/** 3. O teste do mudo: escreve volume 0 na RAM e pergunta pros seus ouvidos. */
async function cenarioMudo() {
  veredito('mudo', 'duvida', 'mandando o mudo...')
  try {
    const resposta = await enviar(writeMemory(Bank.Presets, 0x80000005, [0x00]))
    const frame = parseSysEx(resposta)
    log('·', isAck(frame) ? 'o pedal respondeu OK' : 'resposta não foi um ACK de sucesso')
    veredito(
      'mudo',
      'duvida',
      'Comando enviado. TOQUE A GUITARRA AGORA e responda abaixo.',
    )
    $('julgamento-mudo').hidden = false
  } catch (erro) {
    veredito('mudo', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

async function responderMudo(ficouMudo: boolean) {
  $('julgamento-mudo').hidden = true
  log('·', `VEREDITO HUMANO: o som ${ficouMudo ? 'PAROU' : 'continuou saindo'}`)
  veredito(
    'mudo',
    ficouMudo ? 'ok' : 'falhou',
    ficouMudo
      ? 'ESCRITA CONFIRMADA. O endereço 0x80000000 é mesmo a área viva. Restaurando o volume...'
      : 'O pedal aceitou mas o som não mudou: 0x80000000 não é onde os parâmetros vivem. Rode o cenário 4. Restaurando mesmo assim...',
  )
  await respirar(200)
  try {
    await enviar(writeMemory(Bank.Presets, 0x80000005, [0x41]))
    log('·', 'volume do preset A restaurado para 0x41 (65)')
  } catch (erro) {
    log('!', `falhou ao restaurar: ${(erro as Error).message}`)
    log('!', 'sem pânico: é RAM. Desligar e ligar o pedal restaura tudo.')
  }
}

/**
 * 3-C. O mesmo teste do mudo, mas no endereço do preset (sem o `0x80000000`).
 *
 * Descoberto em 15/08: escrever com o flag `0x80000000` não muda o áudio. E os
 * presets lidos em `0x05 @ 0x0000` acompanham os knobs físicos, então é ali que
 * o estado real mora. O `mix` do preset A saiu de `0x00` para `0x51` sozinho —
 * bits foram LIGADOS, o que flash não faz sem apagar antes. Logo essa área
 * aceita reescrita e o valor volta.
 */
async function cenarioMudoReal() {
  veredito('mudo-real', 'duvida', 'preparando a escuta...')
  try {
    await prepararAudio()

    // lê o volume atual pra restaurar exatamente o que estava lá
    const antesLeitura = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    const volumeOriginal = antesLeitura[5]
    log('·', `volume atual do preset A: 0x${volumeOriginal.toString(16)} (${volumeOriginal})`)
    await respirar(150)

    veredito('mudo-real', 'duvida', 'medindo o nível atual (2s)...')
    const antes = await medirNivel(2000)
    log('·', `nível ANTES: ${dB(antes)}`)
    if (antes === -Infinity || antes < -75) {
      veredito(
        'mudo-real',
        'duvida',
        `Entrada em ${dB(antes)} — silenciosa demais. Suba o volume do pedal e tente de novo.`,
      )
      return
    }

    await enviar(writeMemory(Bank.Presets, 0x00000005, [0x00]))
    log('·', 'volume escrito como 0 em 0x05 @ 0x00000005 (sem o flag 0x80000000)')
    await respirar(400)

    const depois = await medirNivel(2000)
    log('·', `nível DEPOIS: ${dB(depois)}`)
    const queda = antes - depois
    log('·', `queda medida: ${queda.toFixed(1)} dB`)

    await respirar(200)
    await enviar(writeMemory(Bank.Presets, 0x00000005, [volumeOriginal]))
    log('·', `volume restaurado para 0x${volumeOriginal.toString(16)}`)
    await respirar(300)

    const conferencia = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    const restaurou = conferencia[5] === volumeOriginal
    log(
      '·',
      restaurou
        ? 'confirmado por leitura: o volume voltou ao valor original'
        : `ATENÇÃO: a leitura mostra 0x${conferencia[5].toString(16)}, não o original`,
    )

    if (queda > 6) {
      veredito(
        'mudo-real',
        'ok',
        `ACHAMOS. O som caiu ${queda.toFixed(1)} dB escrevendo em 0x05 @ 0x05. É aqui que se escreve — o 0x80000000 era o endereço errado. ${restaurou ? 'Volume restaurado e conferido.' : 'CONFIRA O VOLUME DO PRESET A.'}`,
      )
    } else {
      veredito(
        'mudo-real',
        'falhou',
        `Também não mudou o som (${dB(antes)} → ${dB(depois)}). A escrita não afeta o áudio por nenhum dos dois endereços — rode o cenário do diff de knobs.`,
      )
    }
  } catch (erro) {
    veredito('mudo-real', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/**
 * 8. A escrita altera a memória? Prova puramente digital — sem áudio, sem
 * guitarra, sem ouvido.
 *
 * Até agora todo teste de escrita dependia do som mudar, o que mistura duas
 * perguntas: "o WriteMemory grava?" e "o DSP relê o que foi gravado?". Este
 * cenário responde só a primeira: escreve um valor diferente do atual e lê de
 * volta na hora. Se o byte mudar, a escrita funciona e o problema é o DSP não
 * reler. Se não mudar, o WriteMemory não grava nada e o ACK só diz "recebi".
 */
async function cenarioProvaEscrita() {
  veredito('prova', 'duvida', 'lendo o estado atual...')
  try {
    const antes = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    // byte 5 do preset C (volume) — mexer no C evita atrapalhar o preset A
    const endereco = 0x20 + 5
    const original = antes[endereco]
    const novo = original === 0x40 ? 0x30 : 0x40
    log('·', `volume do preset C agora: 0x${original.toString(16)} — vou escrever 0x${novo.toString(16)}`)
    await respirar(150)

    await enviar(writeMemory(Bank.Presets, endereco, [novo]))
    await respirar(300)

    const depois = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    const lido = depois[endereco]
    log('·', `releitura imediata: 0x${lido.toString(16)}`)

    await respirar(200)
    await enviar(writeMemory(Bank.Presets, endereco, [original]))
    await respirar(300)
    const final = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    log('·', `depois de restaurar: 0x${final[endereco].toString(16)}`)

    if (lido === novo) {
      veredito(
        'prova',
        'ok',
        `A ESCRITA GRAVA. O byte virou 0x${novo.toString(16)} e voltou para 0x${final[endereco].toString(16)}. O que falta é fazer o DSP reler — não é o WriteMemory que está quebrado.`,
      )
    } else {
      veredito(
        'prova',
        'falhou',
        `A escrita NÃO grava: pedi 0x${novo.toString(16)}, a memória continua 0x${lido.toString(16)}. O ACK do pedal significa só "recebi o comando".`,
      )
    }
  } catch (erro) {
    veredito('prova', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/**
 * 9. Escrever + mandar aplicar (`save_0`).
 *
 * Sabemos que a escrita grava e que o som não muda. Faltava o comando que o
 * CubeSuite dispara no botão de salvar: `flash_save_0(bank 5, endereço)`, que
 * é um WriteMemory sem dados. Este cenário escreve o volume, manda o commit, e
 * mede — é a última peça do M1.
 */
async function cenarioCommit() {
  veredito('commit', 'duvida', 'preparando a escuta...')
  try {
    await prepararAudio()

    const antesLeitura = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    const volumeOriginal = antesLeitura[5]
    log('·', `volume do preset A: 0x${volumeOriginal.toString(16)}`)
    await respirar(150)

    const antes = await medirNivel(2000)
    log('·', `nível ANTES: ${dB(antes)}`)
    if (antes === -Infinity || antes < -75) {
      veredito('commit', 'duvida', `Entrada em ${dB(antes)} — silenciosa demais pra medir.`)
      return
    }

    await enviar(writeMemory(Bank.Presets, 0x00000005, [0x00]))
    log('·', 'volume escrito como 0')
    await respirar(150)

    const respostaCommit = parseSysEx(await enviar(saveCommit(Bank.Presets, 0x0000)))
    log(
      '·',
      `save_0 enviado (WriteMemory sem dados) — pedal respondeu ${isAck(respostaCommit) ? 'OK' : 'com falha'}`,
    )
    await respirar(400)

    const depois = await medirNivel(2000)
    log('·', `nível DEPOIS: ${dB(depois)}`)
    const queda = antes - depois
    log('·', `queda medida: ${queda.toFixed(1)} dB`)

    await respirar(200)
    await enviar(writeMemory(Bank.Presets, 0x00000005, [volumeOriginal]))
    await respirar(150)
    await enviar(saveCommit(Bank.Presets, 0x0000))
    log('·', `volume restaurado para 0x${volumeOriginal.toString(16)} e aplicado`)
    await respirar(300)

    const conferencia = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    log(
      '·',
      conferencia[5] === volumeOriginal
        ? 'confirmado por leitura: o volume voltou ao original'
        : `ATENÇÃO: leitura mostra 0x${conferencia[5].toString(16)}`,
    )

    if (queda > 6) {
      veredito(
        'commit',
        'ok',
        `É ISSO. O som caiu ${queda.toFixed(1)} dB depois do save_0. Escrever + aplicar é o ciclo completo — o M1 fecha aqui.`,
      )
    } else {
      veredito(
        'commit',
        'falhou',
        `Nem com o save_0 o som mudou (${queda.toFixed(1)} dB). O commit sozinho não basta; falta descobrir o que mais o pedal espera.`,
      )
    }
  } catch (erro) {
    veredito('commit', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/**
 * 10. Escrever e recarregar pelo footswitch.
 *
 * O software oficial não edita parâmetros deste modelo — a dialog do Cube Baby
 * só mexe em IR. Ou seja, não existe comando de "aplicar ao vivo" pra procurar:
 * o firmware carrega o preset no DSP quando ele é **selecionado**. Então a
 * sequência que deve funcionar é escrever e trocar de preset no pé.
 */
let volumeAntesDaTroca: number | null = null

async function cenarioTroca() {
  veredito('troca', 'duvida', 'escrevendo...')
  try {
    await prepararAudio()
    const leitura = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    volumeAntesDaTroca = leitura[5]
    log('·', `volume do preset A: 0x${volumeAntesDaTroca.toString(16)}`)

    const antes = await medirNivel(1500)
    log('·', `nível antes de tudo: ${dB(antes)}`)

    await respirar(150)
    await enviar(writeMemory(Bank.Presets, 0x00000005, [0x00]))
    await respirar(300)
    const conferencia = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    log('·', `volume gravado como 0x${conferencia[5].toString(16)} — confirmado na memória`)

    veredito(
      'troca',
      'duvida',
      'GRAVADO. Agora pise no footswitch B e volte no A, e clique no botão que apareceu.',
    )
    $('troca-pronto').hidden = false
  } catch (erro) {
    veredito('troca', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

async function cenarioTrocaConferir() {
  $('troca-pronto').hidden = true
  veredito('troca', 'duvida', 'medindo depois da troca...')
  try {
    const depois = await medirNivel(2000)
    log('·', `nível depois de recarregar o preset: ${dB(depois)}`)

    await respirar(200)
    await enviar(writeMemory(Bank.Presets, 0x00000005, [volumeAntesDaTroca ?? 0x41]))
    log('·', `volume restaurado para 0x${(volumeAntesDaTroca ?? 0x41).toString(16)} — pise B e volte em A de novo pra recarregar`)

    if (depois === -Infinity || depois < -75) {
      veredito(
        'troca',
        'ok',
        `SILENCIOU (${dB(depois)}). Escrever + recarregar pelo footswitch é o caminho: o app pode editar presets. Restaurei o volume — pise B e volte em A pra ouvir de novo.`,
      )
    } else {
      veredito(
        'troca',
        'falhou',
        `Ainda em ${dB(depois)} — nem recarregando o preset o valor pega. O firmware provavelmente ignora escrita externa nesse modelo. Volume restaurado.`,
      )
    }
  } catch (erro) {
    veredito('troca', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/**
 * 11. Trocar o modo do pedal e então escrever.
 *
 * Hipótese que explica todos os resultados anteriores: o pedal está em LIVE,
 * onde o som sai dos knobs físicos e o preset gravado é ignorado. O CubeSuite
 * tem um comando dedicado pra isso (`0x50`) que nunca disparamos.
 */
async function cenarioModo() {
  veredito('modo', 'duvida', 'preparando...')
  try {
    await prepararAudio()
    const leitura = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    const volumeOriginal = leitura[5]

    const antes = await medirNivel(1500)
    log('·', `nível inicial: ${dB(antes)}`)
    if (antes === -Infinity || antes < -75) {
      veredito('modo', 'duvida', `Entrada em ${dB(antes)} — silenciosa demais pra medir.`)
      return
    }

    const resposta = parseSysEx(await enviar(modeChange()))
    log(
      '·',
      `comando 0x50 enviado — pedal respondeu tipo 0x${resposta.type.toString(16)} (${isAck(resposta) ? 'ACK ok' : 'resposta diferente do ACK'})`,
    )
    await respirar(500)

    const depoisDoModo = await medirNivel(1500)
    log('·', `nível depois da troca de modo: ${dB(depoisDoModo)}`)

    await enviar(writeMemory(Bank.Presets, 0x00000005, [0x00]))
    log('·', 'volume escrito como 0 já no modo novo')
    await respirar(500)

    const depoisDaEscrita = await medirNivel(2000)
    log('·', `nível depois da escrita: ${dB(depoisDaEscrita)}`)
    const queda = depoisDoModo - depoisDaEscrita
    log('·', `queda atribuível à escrita: ${queda.toFixed(1)} dB`)

    await respirar(200)
    await enviar(writeMemory(Bank.Presets, 0x00000005, [volumeOriginal]))
    log('·', `volume restaurado para 0x${volumeOriginal.toString(16)}`)

    if (queda > 6) {
      veredito(
        'modo',
        'ok',
        `ACHAMOS. Depois de trocar o modo, a escrita passou a valer: caiu ${queda.toFixed(1)} dB. A sequência é trocar de modo e então escrever.`,
      )
    } else {
      veredito(
        'modo',
        'falhou',
        `O pedal aceitou o 0x50 mas a escrita continua sem efeito (${queda.toFixed(1)} dB). Confira se algo mudou no pedal — LED, comportamento dos knobs — e me conte.`,
      )
    }
  } catch (erro) {
    veredito('modo', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/**
 * Conserto: devolve os 13 bytes de cada preset aos valores de fábrica.
 *
 * Existe porque um bug desta bancada (execuções sobrepostas) deixou o volume do
 * preset A gravado em zero. Escreve preset por preset e confere por leitura.
 */
async function cenarioRestaurar() {
  veredito('restaurar', 'duvida', 'restaurando os 3 presets...')
  try {
    for (const slot of SLOTS) {
      await enviar(writeMemory(Bank.Presets, slot.offset, FABRICA[slot.nome]))
      log('·', `preset ${slot.nome} reescrito: ${hex(FABRICA[slot.nome])}`)
      await respirar(250)
    }

    const conferencia = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
    ).data
    const erros: string[] = []
    for (const slot of SLOTS) {
      const bytes = [...conferencia.slice(slot.offset, slot.offset + 13)]
      const ok = FABRICA[slot.nome].every((b, i) => b === bytes[i])
      log('·', `${slot.nome}: ${hex(bytes)} ${ok ? '✓' : '✗'}`)
      if (!ok) erros.push(slot.nome)
    }

    veredito(
      'restaurar',
      erros.length === 0 ? 'ok' : 'falhou',
      erros.length === 0
        ? 'Os 3 presets voltaram aos valores de fábrica, conferidos por leitura.'
        : `Não consegui restaurar: ${erros.join(', ')}. Veja o log.`,
    )
  } catch (erro) {
    veredito('restaurar', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

// ─────────────────────────────────────── diff de knobs (descoberta genérica)

interface Foto {
  presets: Uint8Array
  painel: Uint8Array
}
let foto: Foto | null = null

async function fotografar(): Promise<Foto> {
  const presets = parseReadResponse(
    parseSysEx(await enviar(readMemory(Bank.Presets, 0x0000, 45))),
  ).data
  await respirar(60)
  const painel: number[] = []
  for (let base = 0x0000; base < 0x0800; base += 0x40) {
    const bloco = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.FxCtrlPanel, base, 0x40))),
    ).data
    painel.push(...bloco)
    await respirar(40)
  }
  return { presets, painel: Uint8Array.from(painel) }
}

const lerFloat = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).getFloat32(offset, true)

/**
 * Compara byte a byte, mas relata em `float32` alinhado: o bank 0x04 é o
 * espaço de trabalho do DSP e tudo ali é ponto flutuante. `0.914 → 0.094` diz
 * muito mais do que quatro linhas de bytes soltos.
 */
function compararRegiao(
  rotulo: string,
  antes: Uint8Array,
  depois: Uint8Array,
  comoFloat: boolean,
): number {
  const limite = Math.min(antes.length, depois.length)
  if (!comoFloat) {
    const mudancas: string[] = []
    for (let i = 0; i < limite; i++) {
      if (antes[i] !== depois[i]) {
        mudancas.push(
          `  0x${i.toString(16).padStart(4, '0')}: ${antes[i].toString(16).padStart(2, '0')} → ${depois[i].toString(16).padStart(2, '0')}`,
        )
      }
    }
    if (mudancas.length)
      log('·', `${rotulo}: ${mudancas.length} byte(s) mudaram\n${mudancas.join('\n')}`)
    return mudancas.length
  }

  const blocos = new Set<number>()
  for (let i = 0; i < limite; i++) {
    if (antes[i] !== depois[i]) blocos.add(i & ~3)
  }
  const linhas = [...blocos]
    .sort((a, b) => a - b)
    .map((base) => {
      const a = lerFloat(antes, base)
      const d = lerFloat(depois, base)
      const legivel = Number.isFinite(a) && Number.isFinite(d)
      const valores = legivel
        ? `${a.toPrecision(6)} → ${d.toPrecision(6)}`
        : `${hex(antes.slice(base, base + 4))} → ${hex(depois.slice(base, base + 4))}`
      return `  0x${base.toString(16).padStart(4, '0')}: ${valores}`
    })
  if (linhas.length)
    log('·', `${rotulo}: ${linhas.length} valor(es) mudaram\n${linhas.join('\n')}`)
  return linhas.length
}

/** 6. Fotografa a memória; você gira um knob; ela mostra o que mudou. */
async function cenarioFotografar() {
  veredito('diff', 'duvida', 'fotografando a memória...')
  try {
    foto = await fotografar()
    veredito(
      'diff',
      'ok',
      'Foto tirada. Agora gire UM knob do pedal (só um) e clique em "Comparar".',
    )
    $('comparar').hidden = false
  } catch (erro) {
    veredito('diff', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

async function cenarioComparar() {
  if (!foto) return
  veredito('diff', 'duvida', 'lendo de novo e comparando...')
  try {
    const agora = await fotografar()
    const knob = ($('knob') as HTMLInputElement).value.trim() || 'knob sem nome'
    log('·', `knob girado: ${knob}`)
    const nosPresets = compararRegiao('presets', foto.presets, agora.presets, false)
    const noPainel = compararRegiao('painel (float)', foto.painel, agora.painel, true)
    if (nosPresets === 0 && noPainel === 0) {
      veredito(
        'diff',
        'duvida',
        'Nada mudou na memória. Ou o knob não foi girado, ou o pedal precisa estar em modo LIVE/EDIT pra refletir.',
      )
    } else {
      veredito(
        'diff',
        'ok',
        `Achei ${nosPresets} byte(s) nos presets e ${noPainel} no painel do DSP. Endereços no log — é ali que esse knob mora.`,
      )
    }
    foto = agora
  } catch (erro) {
    veredito('diff', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/**
 * 7. O teste decisivo: escrever um `float32` no bank 0x04.
 *
 * O diff de knobs mostrou que girar um controle mexe em floats aqui, e não nos
 * bytes do preset. É também por aqui que o `fx_ctrl_panel_write` do CubeSuite
 * manda IR. Se a escrita funciona em algum lugar, é neste.
 */
async function cenarioEscreverFloat() {
  const campo = $('addr-float') as HTMLInputElement
  const endereco = parseInt(campo.value.replace(/^0x/i, ''), 16)
  if (!Number.isFinite(endereco)) {
    veredito('float', 'falhou', 'Endereço inválido — use hexadecimal, ex: 06dc')
    return
  }
  const base = endereco & ~3
  veredito('float', 'duvida', `preparando a escuta (0x${base.toString(16)})...`)
  try {
    await prepararAudio()

    const antesBytes = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.FxCtrlPanel, base, 4))),
    ).data
    const original = lerFloat(antesBytes, 0)
    log('·', `valor atual em 0x${base.toString(16)}: ${original.toPrecision(6)} (${hex(antesBytes)})`)

    // escrever o mesmo valor que já está lá não prova nada: se o parâmetro já
    // é zero, mandar zero não muda som nenhum e o teste sai falso-negativo
    const alvo = Math.abs(original) < 1e-6 ? 1 : 0
    log('·', `vou escrever ${alvo.toPrecision(2)} (contrasta com o atual)`)
    await respirar(150)

    const antes = await medirNivel(2000)
    log('·', `nível ANTES: ${dB(antes)}`)
    if (antes === -Infinity || antes < -75) {
      veredito('float', 'duvida', `Entrada em ${dB(antes)} — silenciosa demais pra medir.`)
      return
    }

    const valor = new Uint8Array(4)
    new DataView(valor.buffer).setFloat32(0, alvo, true)
    await enviar(writeMemory(Bank.FxCtrlPanel, base, valor))
    log('·', `escrito ${alvo.toPrecision(2)} (float) em bank 0x04 @ 0x${base.toString(16)}`)
    await respirar(400)

    const conferencia = parseReadResponse(
      parseSysEx(await enviar(readMemory(Bank.FxCtrlPanel, base, 4))),
    ).data
    const pegou = lerFloat(conferencia, 0) === alvo
    log(
      '·',
      pegou
        ? 'a leitura confirma: o valor virou 0.0 na memória'
        : `a memória continua com ${lerFloat(conferencia, 0).toPrecision(6)} — a escrita não pegou`,
    )

    const depois = await medirNivel(2000)
    log('·', `nível DEPOIS: ${dB(depois)}`)
    const queda = antes - depois
    log('·', `queda medida: ${queda.toFixed(1)} dB`)

    // devolve o valor original
    const volta = new Uint8Array(4)
    new DataView(volta.buffer).setFloat32(0, original, true)
    await respirar(200)
    await enviar(writeMemory(Bank.FxCtrlPanel, base, volta))
    log('·', `valor restaurado para ${original.toPrecision(6)}`)

    if (Math.abs(queda) > 6) {
      veredito(
        'float',
        'ok',
        `ESCRITA CONFIRMADA. Som variou ${queda.toFixed(1)} dB escrevendo float no bank 0x04 @ 0x${base.toString(16)}. É esse o caminho — o M1 fecha aqui.`,
      )
    } else if (pegou) {
      veredito(
        'float',
        'duvida',
        `A escrita pegou na memória (virou ${alvo.toPrecision(2)}) mas o som quase não mudou (${queda.toFixed(1)} dB). Ou esse endereço não é volume, ou o DSP só relê ao trocar de preset.`,
      )
    } else {
      veredito(
        'float',
        'falhou',
        'A escrita não alterou nem a memória. O bank 0x04 parece ser somente leitura por este comando.',
      )
    }
  } catch (erro) {
    veredito('float', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/** 4. Caçar os parâmetros ao vivo lendo o bank 4 — só leitura, risco zero. */
async function cenarioCacar() {
  veredito('cacar', 'duvida', 'varrendo o bank 0x04...')
  const assinatura = FABRICA.A.slice(0, 6) // type..volume do preset A
  let achados = 0
  try {
    for (let base = 0x0000; base < 0x0800; base += 0x40) {
      const resposta = await enviar(readMemory(Bank.FxCtrlPanel, base, 0x40))
      const { data } = parseReadResponse(parseSysEx(resposta))
      if (data.some((b) => b !== 0)) {
        log('·', `0x${base.toString(16).padStart(4, '0')}: ${hex(data)}`)
      }
      for (let i = 0; i + assinatura.length <= data.length; i++) {
        if (assinatura.every((b, j) => data[i + j] === b)) {
          achados++
          log(
            '·',
            `ACHOU a assinatura do preset A em 0x${(base + i).toString(16)}`,
          )
        }
      }
      await respirar(60)
    }
    veredito(
      'cacar',
      achados > 0 ? 'ok' : 'duvida',
      achados > 0
        ? `Encontrei a assinatura do preset A em ${achados} lugar(es) — endereços no log.`
        : 'Não achei os 13 bytes do preset no bank 0x04. O log tem tudo que não veio zerado.',
    )
  } catch (erro) {
    veredito('cacar', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

/** 5. Escrever e ler de volta o mesmo endereço, com a pausa que o CubeSuite usa. */
async function cenarioEcoar() {
  veredito('ecoar', 'duvida', 'escrevendo e lendo de volta...')
  try {
    await enviar(writeMemory(Bank.Presets, 0x80000005, [0x33]))
    await respirar(300)
    const resposta = await enviar(readMemory(Bank.Presets, 0x80000000, 45))
    const { data } = parseReadResponse(parseSysEx(resposta))
    log('·', `área viva depois da escrita: ${hex(data.slice(0, 13))}`)
    const voltou = data[5] === 0x33
    veredito(
      'ecoar',
      voltou ? 'ok' : 'duvida',
      voltou
        ? 'O valor 0x33 voltou na leitura: a escrita pega e a área é legível.'
        : 'A área continua lendo zeros — ela não devolve o que foi escrito (o cenário 3 é quem decide se a escrita surtiu efeito).',
    )
    await respirar(200)
    await enviar(writeMemory(Bank.Presets, 0x80000005, [0x41]))
    log('·', 'volume restaurado para 0x41')
  } catch (erro) {
    veredito('ecoar', 'falhou', (erro as Error).message)
    log('!', (erro as Error).message)
  }
}

// ─────────────────────────────────────────────────────────── log

function copiarLog() {
  navigator.clipboard.writeText($('log').textContent ?? '').then(() => {
    const botao = $('copiar')
    botao.textContent = 'copiado!'
    setTimeout(() => (botao.textContent = 'copiar log'), 1500)
  })
}

function baixarLog() {
  const blob = new Blob([$('log').textContent ?? ''], { type: 'text/plain' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `bancada-cubebaby-${new Date().toISOString().slice(0, 16).replace(':', 'h')}.txt`
  link.click()
  URL.revokeObjectURL(link.href)
}

$('conectar').addEventListener('click', () => {
  conectar().catch((erro) => log('!', `acesso negado ou falhou: ${erro.message}`))
})
$('copiar').addEventListener('click', copiarLog)
$('baixar').addEventListener('click', baixarLog)
$('limpar').addEventListener('click', () => ($('log').textContent = ''))
$('mudo-sim').addEventListener('click', () => void responderMudo(true))
$('mudo-nao').addEventListener('click', () => void responderMudo(false))
$('troca-pronto').addEventListener('click', () => void cenarioTrocaConferir())
$('comparar').addEventListener('click', () => void cenarioComparar())
$('ouvir').addEventListener('click', () => {
  listarEntradas().catch((erro) =>
    log('!', `não consegui acessar o áudio: ${(erro as Error).message}`),
  )
})

const cenarios: Record<string, () => Promise<void>> = {
  identidade: cenarioIdentidade,
  presets: cenarioLerPresets,
  mudo: cenarioMudo,
  'mudo-medido': cenarioMudoMedido,
  'mudo-real': cenarioMudoReal,
  prova: cenarioProvaEscrita,
  commit: cenarioCommit,
  troca: cenarioTroca,
  modo: cenarioModo,
  restaurar: cenarioRestaurar,
  diff: cenarioFotografar,
  float: cenarioEscreverFloat,
  cacar: cenarioCacar,
  ecoar: cenarioEcoar,
}
document
  .querySelectorAll<HTMLButtonElement>('button[data-cenario]')
  .forEach((botao) => {
    botao.addEventListener('click', async () => {
      if (rodando) {
        log('!', 'já tem um cenário rodando — espere ele terminar antes de clicar de novo')
        return
      }
      const nome = botao.dataset.cenario!
      rodando = true
      document
        .querySelectorAll<HTMLButtonElement>('button[data-cenario]')
        .forEach((b) => (b.disabled = true))
      log('·', `─── cenário: ${nome} ───`)
      try {
        await cenarios[nome]()
      } finally {
        rodando = false
        document
          .querySelectorAll<HTMLButtonElement>('button[data-cenario]')
          .forEach((b) => (b.disabled = !saida))
      }
    })
  })

log('·', 'bancada pronta. Comece clicando em "Conectar ao pedal".')
