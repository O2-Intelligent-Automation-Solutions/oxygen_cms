# First-Run Setup Wizard

The setup wizard now separates deployment selection from database credentials so users are not presented with every database field at once.

## Database Setup Sequence

1. **Deployment**
   - Self-contained local MySQL, when the deployment advertises `CMS_MANAGED_MYSQL=true`.
   - Create/configure database on a local MySQL server.
   - Connect to an existing local/remote MySQL server.
2. **Connection**
   - Local mode collects port and database name.
   - Existing mode collects host, port, and database name.
   - Self-contained mode skips this step and uses deployment-provided values.
3. **Credentials**
   - Local mode collects privileged user/password and generated application DB user/password.
   - Existing mode collects privileged schema credentials and application runtime credentials; no passwords are defaulted or generated.
   - Self-contained mode skips this step and uses generated deployment secrets that are not exposed in the browser.
4. **Review**
   - Shows mode, host, port, database, and runtime user before provisioning.

After database settings are saved, the wizard proceeds to schema application, first administrator creation, and sign-in.

## Self-Contained Deployment Model

The browser wizard does not install MySQL directly. The deployment package starts MySQL and supplies generated secrets to the API. The wizard then provisions the CMS database, runtime user, and schema using those managed settings.

Docker Compose advertises this mode with:

```text
CMS_MANAGED_MYSQL=true
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=O2IAS_CMS
MYSQL_USER=oxygen_cms
MYSQL_PASSWORD=<generated or compose default>
MYSQL_PRIVILEGED_USER=root
MYSQL_ROOT_PASSWORD=<generated or compose default>
```

## Custom Database Model

For remote/custom MySQL, the user supplies both setup/schema privileged credentials and the application runtime credentials. Privileged credentials are used for setup/schema only; the application binds with the runtime user for day-to-day access.
