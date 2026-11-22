# Keycloak e autenticação Windows

A aplicação é um cliente web confidencial OIDC. O navegador recebe um cookie opaco da aplicação, não tokens de acesso. O fluxo usa Authorization Code, PKCE S256, state e nonce. As respostas JWT têm assinatura verificada com as chaves publicadas pelo realm, além de issuer, audience e validade.

## Cadastro do cliente pela TI

1. Criar cliente OpenID Connect confidencial, com autenticação de cliente por `client_secret_basic` e Standard Flow habilitado.
2. Manter Implicit Flow e Direct Access Grants desabilitados. Exigir PKCE S256 e ID tokens assinados com RS256.
3. Registrar exatamente `APP_ORIGIN/auth/callback` como URI de redirecionamento; não usar curingas. Configurar o endereço da aplicação e as origens conforme as regras corporativas.
4. Configurar `APP_ORIGIN/auth/backchannel-logout` como URL de backchannel logout e incluir o identificador da sessão (`sid`) no ID token. Permitir conectividade do Keycloak até esse endpoint.
5. Entregar issuer, client ID e segredo pelo canal de configuração aprovado. O segredo não deve ir para o GitHub nem para o frontend.

## Windows / AD / Kerberos

A TI conecta o realm à federação/diretório e ao fluxo de autenticação Windows que a WEG já administra. Conforme a política corporativa, isso pode envolver Active Directory, Kerberos/SPNEGO, provedores federados e configuração dos navegadores/zonas de intranet. Essas configurações ficam no Keycloak e na infraestrutura da WEG, não no código JavaScript do painel.

A aplicação não confia em cabeçalhos como `X-Remote-User` ou `X-Windows-User` e não tenta ler o usuário do Windows no navegador. Ela aceita a identidade validada pelo Keycloak.

## Identidade e permissões

O vínculo é a combinação **issuer + sub**, não e-mail ou nome de usuário. Uma identidade autenticada ainda precisa de cadastro ativo no painel. Não há criação automática nem promoção a administrador a partir de atributos enviados pelo navegador.

Os perfis, turnos, seções e permissões operacionais são mantidos no painel. O primeiro administrador é cadastrado pela TI via `user:provision`; os demais podem ser cadastrados pelo administrador com o `sub` fornecido pela TI. O vínculo do sujeito é imutável na interface, para preservar autoria e evitar troca de identidade acidental. Alterações controladas de vínculos históricos usam a ferramenta de provisionamento offline.

## Sessões e saída

A sessão é registrada no PostgreSQL. O cookie de produção usa `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax` e `Path=/`. Ela expira após **15 minutos sem atividade** ou, no máximo, 8 horas após a entrada. A expiração é aplicada no servidor e nas páginas do painel, ajuda e acompanhamentos.

**Sair** encerra a sessão deste aplicativo. Não encerra a sessão do Windows nem força logout em outros sistemas corporativos. Se o Keycloak enviar um logout por backchannel válido, as sessões correspondentes também são invalidadas. O backchannel valida assinatura, issuer, audience, iat, jti/evento e sujeito/sessão; a mensagem pode ser repetida sem reaplicar a operação.

A TI deve homologar o comportamento com seu tempo de SSO, rotação de chaves, desativação de contas e políticas de logout. A desativação local de um usuário invalida suas sessões; políticas de diretório devem ser propagadas pelo Keycloak/integração corporativa.
