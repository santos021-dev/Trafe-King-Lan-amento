/**
 * Fronteira da futura integração. Nenhum SDK, projeto, credencial ou serviço é inicializado agora.
 * Retornar null significa indisponível, nunca "usuário desconectado" ou uma sessão fictícia.
 *
 * ETAPA FUTURA — ver docs/FIREBASE-SETUP.md:
 * 1. Inicializar o Firebase App Web com a configuração REAL do projeto e SDK modular versionado.
 * 2. Criar Firebase Auth; o próprio SDK gerencia credenciais, persistência, renovação e saída.
 * 3. Obter Cloud Firestore somente após regras revisadas e testes no Emulator Suite.
 * 4. Retornar um adaptador com métodos REAIS:
 *    signIn({ email, password }) -> Promise após signInWithEmailAndPassword;
 *    register({ displayName, username, email, password, termsAccepted }) -> Promise após
 *       createUserWithEmailAndPassword + provisionamento seguro de perfil público/conta privada;
 *    resetPassword(email) -> Promise após sendPasswordResetEmail;
 *    observeAuth(callback) -> unsubscribe, usando onAuthStateChanged;
 *    signOut() -> Promise após signOut.
 * Não retornar este adaptador antes de todos os fluxos estarem implementados e testados.
 * Firestore: profiles/{uid} é público; accounts/{uid} é privado. Nunca juntar os documentos.
 * Papéis vêm de custom claims definidas por servidor confiável, nunca do formulário ou perfil.
 * Nunca salvar manualmente senha/token, nem retornar dados de Auth como um perfil público.
 */
export async function getFirebaseServices() {
  return null;
}
