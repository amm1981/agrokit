import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { AppRouter } from './routes/AppRouter'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
