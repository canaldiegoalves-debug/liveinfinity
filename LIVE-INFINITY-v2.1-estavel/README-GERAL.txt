ORION — SISTEMA DE E-MAIL + CHAVE DE ACESSO

LOGIN ADMIN PADRÃO
Usuário: admin
Senha: 123456

Para trocar:
Abra license-server/iniciar-servidor.bat

FUNCIONAMENTO
1. Você cadastra o e-mail.
2. Escolhe Básico ou Pro.
3. Digita qualquer quantidade de dias.
4. O sistema gera uma chave única.
5. A chave fica aguardando ativação.
6. Os dias começam somente na primeira ativação.
7. O cliente entra usando e-mail + chave.
8. A chave fica vinculada ao computador.

PAINEL ADMIN
- Gerar e copiar chave.
- Ver dias restantes.
- Adicionar dias.
- Bloquear e desbloquear.
- Liberar computador.
- Excluir licença.

COMO ABRIR
1. Dê dois cliques em license-server/iniciar-servidor.bat
2. Abra http://localhost:8787
3. Entre com admin / 123456

EXTENSÃO
Carregue a pasta extension em chrome://extensions.


CORREÇÃO — ATUALIZAÇÃO AUTOMÁTICA DO ADMIN
- O painel consulta o servidor automaticamente a cada 2 segundos.
- Quando o cliente ativa a chave, o status muda de “Aguardando ativação” para “Ativa”.
- Ativação, vencimento e dias restantes aparecem sem precisar recarregar a página.
- Também atualiza ao voltar para a aba do painel.


CORREÇÃO v4 — ADMIN E EXTENSÃO INTEGRADOS
- A extensão v9.1 agora ativa a chave diretamente na API do Admin.
- A primeira ativação atualiza activatedAt, expiresAt, status e dispositivo.
- O painel Admin atualiza automaticamente a cada 2 segundos.
- O Admin permite trocar entre Plano Básico e Plano Pro.
- A extensão sincroniza plano, status e dias automaticamente a cada 15 segundos.
- Se a licença for bloqueada ou expirar, a extensão encerra a sessão.
