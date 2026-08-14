import { PROTOCOL_PACKAGE_READY } from 'protocol'
import { PROFILES_PACKAGE_READY } from 'profiles'

function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Cuvave Studio</h1>
      <p>Hello World 👋 — editor de presets pra pedaleiras Cuvave/M-VAVE.</p>
      <ul>
        <li>packages/protocol: {PROTOCOL_PACKAGE_READY ? '✅ importado' : '❌'}</li>
        <li>packages/profiles: {PROFILES_PACKAGE_READY ? '✅ importado' : '❌'}</li>
      </ul>
    </main>
  )
}

export default App
