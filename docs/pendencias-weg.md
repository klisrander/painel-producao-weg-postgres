# Pendências para concluir na WEG

A base foi preparada; a entrada em produção ainda depende das etapas abaixo. Nenhuma delas pode ser comprovada com exemplos públicos ou credenciais fictícias.

| Item                     | O que já existe                                                                 | O que a WEG precisa fornecer / executar                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Modelo de dados          | Modelo lógico, dicionário, Prisma e migração PostgreSQL                         | Revisão do DBA/arquitetura e aprovação dos códigos/limites organizacionais                                                          |
| Padrão de autenticação   | OIDC/Keycloak com PKCE, nonce, state e validação de assinatura                  | Template/documentação oficial do Developers Portal e comparação/ajustes exigidos                                                    |
| Login Windows            | Delegação ao Keycloak                                                           | Realm/issuer, client, audience, segredos no cofre e federação Windows/AD existente                                                  |
| WBS / administradores    | Autorização por roles **e** grupos, com escopo de unidade; sem concessão local  | Nomes reais das claims, grupos/roles, matriz por cargo, mappers e concessão por chamado                                             |
| Revogação / SSO          | Introspecção e backchannel logout preparados                                    | Clients autorizados, URLs registradas e testes reais de revogação, logout e MFA                                                     |
| PostgreSQL               | Esquema normalizado, FKs, CHECKs, triggers, índices e concorrência              | Instância, banco, CA/TLS, papéis mínimos, backup/PITR, restauração, retenção e monitoramento                                        |
| Redis técnico            | Sessões cifradas, locks de refresh e replay de logout                           | Serviço/ACL/TLS aprovado, capacidade, disponibilidade e política de limpeza                                                         |
| Tradução                 | Dicionários pt-BR/en-US/es-ES e traduções de etapas/motivos                     | Revisão terminológica e traduções de nomes/cadastros reais; acrescentar idiomas quando necessário                                   |
| GitLab                   | Arquivo CI/CD e organização de imagens                                          | Projeto GitLab WEG, templates oficiais, runners/BuildKit, registry e variáveis protegidas                                           |
| Kubernetes               | Manifestos, overlays, probes e execução sem privilégios                         | Cluster/contexto, namespaces, Ingress, recursos, secrets, CA, políticas de rede e observabilidade                                   |
| Domínio e DNS            | Aplicação aceita origem por variável                                            | FQDN WEG, registros DNS, certificado e janela de corte; domínio atual permanece separado                                            |
| E-mail                   | SMTP TLS, allowlist, destinatários por unidade e outbox com retries             | Confirmar serviço oficial; informar host/API, credenciais/identidade e remetente; adaptar se for Graph/API; testar e habilitar cron |
| Dados atuais             | Importador com dry run, transação e idempotência                                | Backup privado, mapeamento de UUIDs, metas-base, carga em homologação e reconciliação assinada                                      |
| Aceite funcional         | Fluxos de produção, paradas, metas, turnos, evolução e planos na nova interface | Conferir com usuários-chave os relatórios antigos, calendários, permissões e fluxos em dispositivos reais                           |
| Segurança / conformidade | Controles na aplicação e verificações automatizadas                             | Scans oficiais, revisão de código/ameaças, teste de carga, retenção/LGPD e aceite formal conforme política WEG                      |
| Publicação               | Imagens e processo de deploy preparados                                         | Rodar esteira no ambiente WEG, aprovar homologação e executar deploy/corte/rollback ensaiado                                        |

## Dados mínimos para abrir o chamado à TI

Enviar o link do repositório e solicitar: projeto GitLab/registry; namespace/esteira; URLs Keycloak e domínio final; IDs de clients e audiences; contrato de roles/grupos/claims WBS e escopos de unidades; PostgreSQL/Redis com TLS; serviço de e-mail; cadeia de certificados; acesso ao template oficial do Developers Portal. Segredos devem ser configurados no cofre, não enviados no chat nem adicionados ao Git público.

## Critério de conclusão

Só considerar a migração concluída após o pipeline corporativo verde, testes com perfis WBS reais, dados reconciliados, restauração de backup comprovada, TLS/DNS corretos, e-mail homologado e aceite dos responsáveis da WEG. Build e testes locais não substituem esses aceites.
