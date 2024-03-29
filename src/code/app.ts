import { auth, cartelas, jogo, jogos, openLogin } from './commom'
import { gerar } from './cartela'
import Alpine from 'alpinejs'

const webapp = () => ({
  cols: ['B', 'I', 'N', 'G', 'O'],

  getIndex(v: number) {
    return Math.floor((v - 1) / 15)
  },

  getCol(v: number) {
    return this.cols[this.getIndex(v)]
  },

  tela: '',
  jogo: undefined as IJogo | undefined,
  cartela: [] as INumeroCartela[][],
  modo: 'automatico' as 'automatico' | 'manual',
  som: true,
  ganhou: false,
  log: [] as string[],

  init() {
    const updateTela = () => {
      const hash = window.location.hash.substr(1)
      this.tela = hash ? hash : 'inicio'
    }
    window.onhashchange = updateTela
    this.abrir()
    updateTela()
  },

  resetar() {
    this.encerrarJogo?.()
    this.jogo = undefined
    this.cartela = []
    this.modo = 'automatico'
    this.ganhou = false
  },

  abrir(tela = 'inicio' as 'inicio' | 'jogo') {
    if (this.tela == tela) return
    if (tela == 'inicio') this.resetar()
    window.location.replace('#' + tela)
  },

  encerrarJogo: undefined as undefined | (() => void),
  async online() {
    const monitorar = () =>
      (this.encerrarJogo = jogo.onSnapshot(async (j) => {
        if (j.exists) {
          const jogo = j.data() as IJogo
          const antigos = this.jogo!.numeros
          const novos = jogo.numeros
            .reverse()
            .filter((v) => !antigos.includes(v))
          this.jogo = jogo
          if (novos.length) {
            const sufix = novos.length > 1 ? 's' : ''
            const msg = `Chamado${sufix} ${novos
              .map((v) => `${this.getCol(v)} ${v}`)
              .join(', ')}`
            this.falar(msg)
            if (this.modo == 'automatico') {
              this.validarMarcacoes(true)
            }
          }
        } else {
          if (this.ganhou) {
            const res = await jogos.orderBy('data', 'desc').limit(1).get()
            const idGanhador = res.docs[0].get('ganhador.id')
            if (idGanhador == auth.currentUser!.uid) {
              alert('BINGO!')
            } else {
              alert(
                'Que pena, você empatou com outros ganhadores e no ' +
                  'sorteio de desempate você não ganhou.'
              )
            }
          } else {
            alert('Que pena, o ganhador não foi você.')
          }
          this.abrir()
        }
      }))
    if (!auth.currentUser) {
      openLogin()
      return
    }
    try {
      const obj = await jogo.get()
      if (obj.exists) {
        const data = obj.data() as IJogo
        data.numeros.reverse()
        const idUser = auth.currentUser!.uid
        const doc = await cartelas
          .doc(idUser)
          .get()
          .catch(() => undefined)
        if (doc?.exists) {
          this.jogo = data
          const cartela = doc.data() as ICartela
          this.cartela = gerar(cartela.numeros)
          this.validarMarcacoes()
          monitorar()
          this.falar('Cartela recuperada, bem-vindo de volta.')
          this.abrir('jogo')
        } else if (!data.numeros.length) {
          this.jogo = data
          const cartela = gerar()
          const numeros = cartela
            .flatMap((v) => v.map((k) => k.v))
            .filter((v) => v > 0)
          await cartelas.doc(idUser).set({ ganhou: false, numeros })
          this.cartela = cartela
          monitorar()
          this.falar('Cartela gerada e participação confirmada.')
          this.abrir('jogo')
        } else {
          this.cartela = []
          alert('Chegou tarde, o jogo já começou.')
        }
      } else alert('Não há nenhum jogo no momento.')
    } catch (error) {
      console.log(error)
      alert('Erro desconhecido.')
    }
  },

  openLogin: openLogin,

  offline() {
    if (!auth.currentUser) {
      openLogin()
      return
    }
    this.resetar()
    this.modo = 'manual'
    this.cartela = gerar()
    this.falar('Cartela gerada, bom jogo.')
    this.abrir('jogo')
  },

  confirmarVoltar() {
    if (this.final || confirm('Tem certeza de que deseja sair do jogo?')) {
      this.abrir()
    }
  },

  final: false,
  getMarcados(cartela: INumeroCartela[][]) {
    const nCartelas = cartela.flatMap((v) => v.filter((k) => k.m))
    const final = nCartelas.length == 24
    if (final && this.jogo) {
      if (nCartelas.every((v) => this.jogo!.numeros.some((k) => k == v.v))) {
        cartelas
          .doc(auth.currentUser!.uid)
          .update({ ganhou: true })
          .then(() => (this.ganhou = true))
      } else this.validarMarcacoes()
    } else if (final) alert('BINGO!\nParabéns, vamos conferir sua cartela.')
    this.final = final
    return nCartelas.length
  },

  trocarAutomatico() {
    if (this.modo == 'manual') {
      this.modo = 'automatico'
      this.validarMarcacoes(true)
    } else {
      this.modo = 'manual'
    }
  },

  validarMarcacoes(log = false) {
    if (!this.jogo) return
    const n = this.jogo.numeros
    const nCartelas = this.cartela.flat()
    const marc: number[] = []
    const desmarc: number[] = []
    nCartelas
      .filter((v) => v.m && !n.includes(v.v))
      .forEach((v) => {
        v.m = false
        if (log) desmarc.push(v.v)
      }) // Marcações erradas
    nCartelas
      .filter((v) => !v.m && n.includes(v.v))
      .forEach((v) => {
        v.m = true
        if (log) marc.push(v.v)
      }) // Marcações ignoradas
    if (marc.length == 1) this.falar(`Marcado ${marc[0]}.`)
    if (marc.length > 1) this.falar(`Marcados ${marc.join(', ')}.`)
    if (desmarc.length == 1) this.falar(`Desmarcado ${desmarc[0]}.`)
    if (desmarc.length > 1) this.falar(`Desmarcados ${desmarc.join(', ')}.`)
  },

  falar(texto: string) {
    const log = this.log
    if (!texto || log[log.length - 1] == texto) return
    if (this.som) log.push(texto)
  },

  falarRestantes(coluna: number) {
    const r = this.cartela[coluna]?.filter((v) => !v.m && v.v > 0) ?? []
    const t = r.length ? r.map((v) => v.v).join(', ') : 'Todos marcados'
    this.falar(this.cols[coluna] + ', ' + t)
  },

  async limparLog(valor: string) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    if (this.log[0] == valor) this.log.shift()
  },
})

Alpine.data('webapp', webapp)
Alpine.start()
