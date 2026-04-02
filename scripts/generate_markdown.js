const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, 'services');
const services = fs.readdirSync(servicesDir).filter(f => fs.statSync(path.join(servicesDir, f)).isDirectory());

const servicePrefixMap = {
  'auth-service': '/api/auth',
  'shop-service': '/api/shop',
  'catalog-service': '/api/catalog',
  'search-service': '/api/search',
  'review-service': '/api/reviews',
  'notification-service': '/api/notification',
  'chat-service': '/api/chat',
  'media-service': '/api/media',
  'account-service': '/api/account',
  'payment-service':'/api/payment'
};

let md = `# Mannathan Backend API Documentation\n\n`;
md += `This documentation covers all the microservices endpoints exposed through the API gateway.\n\n`;
md += `## Base URL\n\n\`http://localhost:8000\`\n\n`;
md += `## Authentication\n\nMost endpoints require a Bearer token in the \`Authorization\` header:\n\n\`\`\`\nAuthorization: Bearer <your_jwt_token>\n\`\`\`\n\n---\n\n`;

for (const service of services) {
  if (service === 'api-gateway') continue;
  
  const routesDir = path.join(servicesDir, service, 'src', 'routes');
  if (!fs.existsSync(routesDir)) continue;

  const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.routes.js') || f.endsWith('.js'));
  if (routeFiles.length === 0) continue;

  md += `## ${service.replace('-service', '').toUpperCase()} Service\n\n`;
  md += `Base prefix: \`${servicePrefixMap[service] || '/api/' + service.replace('-service', '')}\`\n\n`;

  for (const file of routeFiles) {
    const filePath = path.join(routesDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const regex = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    let match;
    
    let prefix = servicePrefixMap[service] || `/api/${service.replace('-service', '')}`;

    let hasRoutes = false;
    let fileMd = `### Module: ${file.replace('.routes.js', '').replace('.js', '')}\n\n`;
    fileMd += `| Method | Endpoint | Description |\n`;
    fileMd += `| --- | --- | --- |\n`;

    while ((match = regex.exec(content)) !== null) {
      hasRoutes = true;
      const method = match[1].toUpperCase();
      let routePath = match[2];
      
      let fullPath = `${prefix}${routePath === '/' ? '' : routePath}`.replace(/\/+/g, '/');

      let methodBadge = '';
      if (method === 'GET') methodBadge = '🟢 GET';
      if (method === 'POST') methodBadge = '🔵 POST';
      if (method === 'PUT') methodBadge = '🟠 PUT';
      if (method === 'PATCH') methodBadge = '🟡 PATCH';
      if (method === 'DELETE') methodBadge = '🔴 DELETE';

      fileMd += `| **${methodBadge}** | \`${fullPath}\` | |\n`;
    }
    
    if (hasRoutes) {
      md += fileMd + '\n';
    }
  }
}

fs.writeFileSync(path.join(__dirname, 'api_documentation.md'), md);
console.log('Markdown generated successfully.');
