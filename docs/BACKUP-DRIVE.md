# Backup escolar (diretor / secretaria)

## O que faz

- Gera um arquivo `.json.gz` só com os dados **da escola logada** (usuários sem senha, turmas, notas, presença, PEI, histórico, etc.).
- Permite cadastrar o **link de uma pasta do Google Drive**.
- Sempre oferece **download** no navegador.
- Se a VEHO configurar uma **conta de serviço Google** no servidor, o arquivo também é enviado à pasta cadastrada (a escola precisa compartilhar a pasta com o e-mail da conta de serviço).

## Quem pode

`diretor`, `secretaria`, `admin`.

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/backup/config` | Pasta Drive + status |
| PUT | `/api/backup/config` | Salva `driveFolderUrl` |
| POST | `/api/backup/gerar` | Gera backup (+ tenta Drive) |
| GET | `/api/backup/lista` | Histórico |
| GET | `/api/backup/:id/download` | Download autenticado |

## Ativar envio automático ao Drive (plataforma)

1. Crie um projeto no Google Cloud → ative **Google Drive API**.
2. Crie uma **Service Account** e baixe o JSON.
3. No Render / `.env`:

```env
GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

4. Na escola: Diretor → Configurações (ou Secretaria → Backup) → cole o link da pasta → compartilhe a pasta com o e-mail `client_email` da service account (permissão Editor).
5. Clique em **Gerar backup agora**.

## Restauração

Diretor/Secretaria podem:

1. Enviar o arquivo `.json.gz` baixado, ou
2. Clicar em **Restaurar neste VEHO** em um backup já gerado no servidor.

O VEHO recolocará os registros (por `_id`) em alunos, turmas, notas, presença, PEI, etc.  
Só aceita backup da **mesma escola**. Senhas de usuários existentes não são alteradas.

## Limites do MVP

- Não inclui binários de documentos (PDF/fotos) no pacote — só metadados.
- Não substitui backup Atlas da infraestrutura VEHO; é cópia operacional da escola.
- Sem service account, o botão ainda gera e baixa o arquivo; o envio ao Drive fica pendente.
- Formato: **JSON compactado (.json.gz)**, não CSV.
