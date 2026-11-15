import { getFirebaseServices } from './firebase-client.js';

// Hoje é uma apresentação vazia, acessível sem login, não uma área falsamente protegida.
// Com o Firebase real, aguardar a restauração da sessão ANTES de ler qualquer dado da conta.
const services = await getFirebaseServices();
if (services) {
  services.observeAuth(user => {
    if (!user) {
      window.location.replace(new URL('../entrar/index.html', location.href).href);
      return;
    }
    // Integração futura de Firestore começa aqui, após autenticação confirmada.
    // Nunca renderizar o objeto user do Auth ou mesclar accounts/{uid} no perfil público.
    // O redirecionamento é experiência de navegação; Security Rules fazem a proteção real.
  });
}
