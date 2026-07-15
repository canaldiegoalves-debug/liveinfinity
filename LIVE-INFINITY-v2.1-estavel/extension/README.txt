LIVE INFINITY MVP v0.9.1

MUDANÇA PRINCIPAL
- Início reorganizado em uma única tela operacional.
- Apenas 5 abas: Início, Áudio, IA, Vídeos e Configurações.
- Timer, Produto, Vendas, Pós-venda, Comentários, Telegram e Log ficam juntos.
- Todas as seções podem ser recolhidas.

INSTALAÇÃO
1. Extraia o ZIP.
2. Abra chrome://extensions.
3. Desative a versão anterior.
4. Carregue a pasta LIVE-INFINITY-MVP-v2.
5. Abra o TikTok Shop e clique no ícone da extensão.

CHAVES
BASIC-30
PRO-30


VERSÃO 0.9.2
- Vários vídeos com remoção pelo X.
- Ignorar cupons ao fixar o produto principal.
- VB-Cable com link oficial, instruções e som de teste.
- Vários áudios, remoção e camadas de ambiente.

A extensão abre o site oficial do VB-Cable. Por segurança do Windows, extensões do Chrome não conseguem instalar drivers automaticamente.


NOVA FUNÇÃO — PROTEÇÃO CONTRA VIOLAÇÃO
- Monitora alertas, diálogos e avisos visíveis do TikTok.
- Usa classificação por múltiplos sinais para reduzir falsos positivos.
- Pode apenas avisar ou encerrar automaticamente a LIVE.
- Envia alerta do navegador e, se configurado, Telegram.
- Possui teste seguro que não clica em nenhum botão.
- O encerramento automático depende dos textos e botões exibidos pela interface atual do TikTok.

IMPORTANTE
Nenhum teste automatizado consegue garantir 100% de funcionamento contra toda futura alteração do TikTok.
Use primeiro o modo somente aviso em uma live de teste e valide o botão “Executar teste seguro”.


CORREÇÕES v0.9.4
- Comunicação corrigida entre Side Panel e página do TikTok usando chrome.tabs.sendMessage.
- O painel agora recebe métricas reais pelo chrome.runtime.
- Comentários automáticos rodam dentro da página, mesmo com o painel fechado.
- O envio simula beforeinput, input, change, Enter e clique no botão de envio como fallback.
- Fixação automática roda dentro da página e reaplica o produto principal a cada 30 segundos.
- Cupons continuam ignorados quando a opção estiver ligada.
- O botão “Iniciar ciclo” muda para “Encerrar ciclo” enquanto o timer estiver ativo.


CORREÇÕES v0.9.5
- A proteção contra violação é ativada automaticamente sempre que a extensão detecta o início de uma LIVE.
- A proteção já vem ligada por padrão em novas instalações.
- A opção de agradecimento pós-venda agora salva imediatamente ao ligar/desligar o botão.
- O status mostra claramente se o agradecimento automático está ATIVO ou DESATIVADO.
- O botão “Testar no chat” agora informa se a mensagem foi enviada ou se o campo não foi localizado.


CORREÇÕES v0.9.6 — CICLO OBRIGATÓRIO DO PRODUTO
- Quando a fixação automática estiver ligada, a extensão executa SEMPRE:
  1. Localiza e clica em DESAFIXAR.
  2. Aguarda o botão FIXAR voltar a aparecer.
  3. Localiza o produto principal, ignorando cupons.
  4. Clica em FIXAR.
- O ciclo é executado imediatamente e repetido a cada 20 segundos.
- Se o botão DESAFIXAR não aparecer, a extensão ainda tenta localizar e clicar em FIXAR.
- O botão manual “Desafixar e fixar agora” executa o mesmo ciclo completo.
- Um bloqueio impede que dois ciclos rodem ao mesmo tempo.


CORREÇÕES v0.9.7
- A extensão verifica a cada 1 segundo se o cartão do produto está realmente aparecendo sobre o vídeo.
- Se o produto sumir da tela, executa imediatamente DESAFIXAR → FIXAR, sem esperar o próximo ciclo.
- Continua refazendo obrigatoriamente DESAFIXAR → FIXAR a cada 20 segundos.
- O campo do chat agora é localizado por placeholder, aria-label, data-placeholder, posição e contexto visual.
- O envio tenta botão de envio, Enter e uma segunda tentativa quando necessário.
- Cada comentário usa um novo intervalo aleatório entre o mínimo e o máximo configurados.
- O log mostra o intervalo sorteado e se o envio realmente foi concluído.


CORREÇÕES v0.9.8
- Removido o monitor de overlay a cada 1 segundo, que causava fixação contínua.
- O botão DESAFIXAR passou a ser a confirmação de que o produto está fixado.
- A extensão executa o ciclo apenas ao ativar e depois a cada 20 segundos:
  DESAFIXAR → aguardar → FIXAR.
- Se não houver DESAFIXAR, fixa diretamente.
- Comentários automáticos agora enviam a primeira mensagem imediatamente.
- As próximas mensagens são enviadas em sequência, com novo intervalo aleatório entre mínimo e máximo.
- O envio usa textarea prioritário, native setter, eventos React, composição e Enter.


CORREÇÃO v0.9.1 — PAINEL EDITÁVEL DURANTE A EXECUÇÃO
- O painel não é mais recriado a cada atualização do TikTok.
- É possível digitar comentários, mensagens pós-venda, Telegram e outros campos enquanto a automação está ativa.
- O cursor permanece no campo.
- Vendas, espectadores, status, tempo, GMV e produto continuam atualizando normalmente.
