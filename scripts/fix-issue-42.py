from pathlib import Path

path = Path('src/ui/ServicesView.tsx')
content = path.read_text(encoding='utf-8')
old = "function toServicePatch(form: FormState): Omit<ComposeServiceForm, 'name'> {\n  const { name: _name, ...patch } = toServiceForm(form);\n  return patch;\n}"
new = "function toServicePatch(form: FormState): Omit<ComposeServiceForm, 'name'> {\n  const service = toServiceForm(form);\n  return {\n    ...(service.image === undefined ? {} : { image: service.image }),\n    ...(service.build === undefined ? {} : { build: service.build }),\n    ports: service.ports,\n    environment: service.environment,\n    volumes: service.volumes,\n    dependsOn: service.dependsOn,\n    ...(service.command === undefined ? {} : { command: service.command }),\n    ...(service.restart === undefined ? {} : { restart: service.restart }),\n  };\n}"
if old not in content:
    raise RuntimeError('Expected toServicePatch implementation not found')
path.write_text(content.replace(old, new, 1), encoding='utf-8')
