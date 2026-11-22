# Migração privada para PostgreSQL

O repositório público contém o aplicativo, não os dados da instância atual. Nenhum arquivo de backup ou segredo deve ser adicionado ao Git. O sistema atual permanece independente até uma virada autorizada.

## Preparar os arquivos

1. Baixar o backup JSON completo de cada seção pela conta administradora do sistema atual (`/api/backup?section=...`). Um administrador geral deve selecionar e exportar Bobinagem, Montagem e Montagem IB. Guardar os arquivos em local privado e protegido.
2. Separar os catálogos internos e as metas-base do checkout original privado. A ferramenta abaixo escreve exclusivamente fora deste repositório:

```sh
node scripts/prepare-runtime-config.mjs --source /caminho/do/checkout-original-confiavel --out /caminho/privado/configuracao
```

3. Configurar no servidor os caminhos `EQUIPMENT_CATALOG_FILE`, `ASSEMBLY_CATALOG_FILE` e `BASELINE_GOALS_FILE`. Em container, montar esses arquivos em modo somente leitura, com permissão de leitura para o usuário `node`.
4. Preparar arquivo privado de vínculos corporativos, por exemplo:

```json
{"users":[{"legacy_id":123,"subject":"SUB_VALIDADO_PELA_TI"}]}
```

`legacy_id` é o id do usuário no banco atual; o issuer é o `OIDC_ISSUER` da implantação. Não vincular por e-mail. Contas sem vínculo são importadas **inativas**, preservando o histórico de autoria. Não é necessário conhecer a senha antiga.

## Validar e importar

Aplicar primeiro as migrações no PostgreSQL de destino. A importação exige tabelas de aplicação vazias. Não provisionar uma conta nova antes de importar, pois isso pode conflitar com IDs históricos.

```sh
node --env-file=.env scripts/migrate.mjs
node --env-file=.env scripts/import-backup.mjs --backups /privado/bobinagem.json /privado/montagem.json /privado/montagem-ib.json --identities /privado/identidades.json
```

A execução acima valida e mostra somente contagens. Para aplicar o conjunto validado:

```sh
node --env-file=.env scripts/import-backup.mjs --backups /privado/bobinagem.json /privado/montagem.json /privado/montagem-ib.json --identities /privado/identidades.json --apply
```

A carga é transacional: preserva IDs de usuários/registros, autoria, configurações, auditoria, planos e revisões. Ajusta as sequências PostgreSQL depois da importação. Duplicidades conflitantes e referências ausentes impedem a carga. Senhas, hashes, e-mails, tentativas, sessões e recuperação de senha não são migrados. Campos de credenciais em snapshots de auditoria são removidos.

Para vincular e ativar depois uma conta histórica ainda sem identidade:

```sh
node --env-file=.env scripts/provision-user.mjs --legacy-id 123 --username usuario.historico --subject SUB_VALIDADO_PELA_TI
```

## Homologação e virada

Conferir por seção e turno: quantidades, defeitos, perturbações/durações, metas/CAP por vigência, projeções, auditoria e exportações. Conferir os perfis com contas aprovadas e os acompanhamentos autenticados.

Na virada, pausar os lançamentos da origem por uma janela combinada, obter a exportação final, repetir a carga em destino vazio, conferir e ativar o domínio corporativo. A TI mantém uma cópia protegida da origem e define o procedimento de retorno. Este repositório não altera o DNS, o domínio ou o banco do site atual.
