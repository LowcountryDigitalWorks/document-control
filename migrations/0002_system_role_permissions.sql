-- Default permission grants for the built-in role catalog.
-- Tenant-defined roles remain data-driven through role_definitions.permissions_json.

UPDATE role_definitions
SET permissions_json = '["*"]'
WHERE role_key = 'platform_admin' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["tenant.manage","workspace.manage","role.manage","template.read","template.use","template.manage","document.read","document.create","document.version.create","document.review","document.approve","workflow.execute","workflow.manage","audit.read","export.create"]'
WHERE role_key = 'tenant_admin' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["workspace.manage","role.manage","template.read","template.use","template.manage","document.read","document.create","document.version.create","document.review","document.approve","workflow.execute","workflow.manage","audit.read","export.create"]'
WHERE role_key = 'workspace_admin' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["document.read","workflow.execute","workflow.manage"]'
WHERE role_key = 'workflow_admin' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["template.read","template.use","template.manage","document.read"]'
WHERE role_key = 'template_manager' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["template.read","template.use","document.read","document.create","document.version.create","workflow.execute","audit.read","export.create"]'
WHERE role_key = 'document_owner' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["template.read","template.use","document.read","document.create","document.version.create","workflow.execute"]'
WHERE role_key = 'author' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["document.read","document.review"]'
WHERE role_key = 'reviewer' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["document.read","document.approve"]'
WHERE role_key = 'approver' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["template.read","document.read","audit.read","export.create"]'
WHERE role_key = 'auditor' AND is_system = 1;

UPDATE role_definitions
SET permissions_json = '["template.read","document.read"]'
WHERE role_key = 'viewer' AND is_system = 1;
