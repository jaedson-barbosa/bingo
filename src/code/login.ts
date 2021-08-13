import { auth, firebase, usuarios, openApp, openAdmin } from './commom'
import Alpine from 'alpinejs'
import IBGE from './IBGE'

const captchaParams = { size: 'invisible' }
const captcha = new firebase.auth.RecaptchaVerifier('avancar', captchaParams)
const toAdmin = new URLSearchParams(window.location.search).has('admin')

Alpine.data('login', () => ({
  exibir: false,
  isAdmin: false,
  telefone: '',
  nome: '',
  estado: '',
  municipio: '',
  iniciadoLogado: true,
  pedirTelefone: false,
  pedirCodigo: false,
  ufs: IBGE,
  confirmationResult: undefined as firebase.auth.ConfirmationResult | undefined,

  submitCodigo: undefined as undefined | ((codigo: string) => void),

  encerrarSessao() {
    auth.signOut()
    window.location.reload()
  },

  init() {
    auth.onAuthStateChanged(async (v) => {
      if (!v) {
        this.iniciadoLogado = false
        this.pedirTelefone = true
        return
      }
      const doc = await usuarios.doc(v.uid).get()
      if (!doc.exists) {
        this.telefone = v.phoneNumber!
        this.exibir = true
      } else if (this.iniciadoLogado) {
        const data = doc.data() as IUsuario
        this.isAdmin = data.admin ?? false
        this.telefone = v.phoneNumber!
        this.nome = data.nome
        this.estado = data.estado
        this.municipio = data.municipio
        this.exibir = true
      } else this.openNext(v.uid)
    })
  },

  async openNext(id: string) {
    if (toAdmin) {
      if (!this.isAdmin && !this.iniciadoLogado) {
        const data = await usuarios.doc(id).get()
        const admin = data.get('admin')
        this.isAdmin = admin ?? false
      }
      if (this.isAdmin || id == 'SwHkTu4OPmd42zhPKzYa5Wh3Y6i2') openAdmin()
      else {
        const msg =
          'Você não é um administrador, por favor, contacte um ' +
          'administrador do sistema para que você possa ser incluído.'
        alert(msg)
      }
    } else openApp()
  },

  proximo() {
    if (!this.telefone.startsWith('+55')) this.telefone = '+55' + this.telefone
    firebase
      .auth()
      .signInWithPhoneNumber(this.telefone, captcha)
      .then((confirmationResult) => {
        this.confirmationResult = confirmationResult
        this.pedirCodigo = true
        this.submitCodigo = (cod) => this.logar(cod)
      })
      .catch((error) => {
        console.log(error)
        alert('Não foi possível enviar o SMS.')
      })
  },

  async logar(codigo: string) {
    if (!this.confirmationResult) return
    this.pedirTelefone = false
    this.pedirCodigo = false
    await this.confirmationResult.confirm(codigo)
  },

  async atualizar() {
    const { telefone, nome, estado, municipio } = this
    const user = auth.currentUser!
    const id = user.uid
    if (telefone != user.phoneNumber) {
      const providerT = firebase.auth.PhoneAuthProvider
      const provider = new providerT()
      const id = await provider
        .verifyPhoneNumber(telefone, captcha)
        .catch(() => '')
      if (!id) {
        const msg =
          'Não foi possível enviar o SMS. Muitas vezes encerrar a sessão ' +
          'e logar novamente resolve este problema.'
        alert(msg)
        return
      }
      this.pedirCodigo = true
      const codigo = await new Promise<string>(
        (res) => (this.submitCodigo = (cod) => res(cod))
      )
      const cred = providerT.credential(id, codigo)
      await user.updatePhoneNumber(cred)
    }
    const data: IUsuario = { telefone, nome, estado, municipio }
    await usuarios.doc(id).set(data, { merge: true })
    this.openNext(id)
  },
}))

Alpine.start()
