import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, createHmac } from 'node:crypto';

const prisma = new PrismaClient();

function generateApiKey(): string {
  return `oc_${randomBytes(24).toString('hex')}`;
}

function generateApiSecret(): string {
  return randomBytes(32).toString('hex');
}

async function main() {
  console.log('Seeding OmniCodex database...');

  // Create demo tenant
  const apiKey = generateApiKey();
  const apiSecret = generateApiSecret();

  const tenant = await prisma.tenant.upsert({
    where: { owTenantId: 'ow-demo-tenant-001' },
    update: {},
    create: {
      owTenantId: 'ow-demo-tenant-001',
      name: 'Demo Tenant - OmniWallet Test',
      apiKey,
      apiSecret,
      webhookUrl: 'https://webhook.example.com/omnicodex',
    },
  });

  console.log(`Tenant created: ${tenant.name}`);
  console.log(`  API Key:    ${apiKey}`);
  console.log(`  API Secret: ${apiSecret}`);

  // Create demo project
  const project = await prisma.project.upsert({
    where: { id: tenant.id + '-demo-project' },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Campaña Danone Verano 2026',
      description: 'Campaña de fidelización con códigos bajo tapa',
      startsAt: new Date('2026-01-01'),
      endsAt: new Date('2026-12-31'),
      metadata: { campaign_type: 'loyalty', region: 'ES' },
    },
  });

  console.log(`Project created: ${project.name} (${project.id})`);

  // Code Rule 1: Simple numeric with Luhn
  const rule1 = await prisma.codeRule.create({
    data: {
      projectId: project.id,
      name: 'Yogur Natural 500g - Numérico Luhn',
      skuReference: 'DN-YN-500',
      totalLength: 11,
      charset: 'NUMERIC',
      hasCheckDigit: true,
      checkAlgorithm: 'LUHN',
      checkDigitPosition: 'LAST',
      structureDef: {
        segments: [
          { name: 'unique_code', type: 'numeric', length: 10 },
          { name: 'check_digit', type: 'check', length: 1, algorithm: 'luhn', appliesTo: ['unique_code'] },
        ],
      },
      maxRedemptions: 1,
      productInfo: {
        sku: 'DN-YN-500',
        name: 'Yogur Natural Danone 500g',
        category: 'Lácteos',
        brand: 'Danone',
      },
      campaignInfo: {
        name: 'Verano Saludable 2026',
        suggested_points: 50,
      },
      pointsValue: 50,
    },
  });

  console.log(`Code Rule 1 created: ${rule1.name} (${rule1.id})`);

  // Code Rule 2: Alphanumeric with prefix and separator
  const rule2 = await prisma.codeRule.create({
    data: {
      projectId: project.id,
      name: 'Actimel Pack 6 - Alfanumérico con prefijo',
      skuReference: 'DN-ACT-6',
      totalLength: 15,
      charset: 'ALPHANUMERIC',
      hasCheckDigit: true,
      checkAlgorithm: 'LUHN',
      checkDigitPosition: 'LAST',
      separator: '-',
      prefix: 'DN',
      structureDef: {
        segments: [
          { name: 'brand_prefix', type: 'fixed', length: 2, value: 'DN' },
          { name: 'year', type: 'numeric', length: 4, min: 2024, max: 2030 },
          { name: 'unique_code', type: 'alphanumeric', length: 8 },
          { name: 'check_digit', type: 'check', length: 1, algorithm: 'luhn', appliesTo: ['unique_code'] },
        ],
      },
      maxRedemptions: 1,
      productInfo: {
        sku: 'DN-ACT-6',
        name: 'Actimel Pack 6 unidades',
        category: 'Lácteos',
        brand: 'Danone',
      },
      campaignInfo: {
        name: 'Verano Saludable 2026',
        suggested_points: 75,
      },
      pointsValue: 75,
    },
  });

  console.log(`Code Rule 2 created: ${rule2.name} (${rule2.id})`);

  // Code Rule 3: With MOD10
  const rule3 = await prisma.codeRule.create({
    data: {
      projectId: project.id,
      name: 'Agua Font Vella 1.5L - MOD10',
      skuReference: 'FV-AQ-150',
      totalLength: 9,
      charset: 'NUMERIC',
      hasCheckDigit: true,
      checkAlgorithm: 'MOD10',
      checkDigitPosition: 'LAST',
      structureDef: {
        segments: [
          { name: 'batch', type: 'numeric', length: 3, min: 100, max: 999 },
          { name: 'serial', type: 'numeric', length: 5 },
          { name: 'check_digit', type: 'check', length: 1, algorithm: 'mod10', appliesTo: ['batch', 'serial'] },
        ],
      },
      maxRedemptions: 1,
      productInfo: {
        sku: 'FV-AQ-150',
        name: 'Font Vella Agua Mineral 1.5L',
        category: 'Bebidas',
        brand: 'Font Vella',
      },
      campaignInfo: {
        name: 'Hidratación Verano',
        suggested_points: 25,
      },
      pointsValue: 25,
    },
  });

  console.log(`Code Rule 3 created: ${rule3.name} (${rule3.id})`);

  // Print helper info
  console.log('\n--- Demo Setup Complete ---');
  console.log('\nTo test validation, use:');
  console.log(`  POST /api/v1/validate`);
  console.log(`  Headers:`);
  console.log(`    X-Api-Key: ${apiKey}`);
  console.log(`    X-Timestamp: <ISO8601>`);
  console.log(`    X-Signature: HMAC-SHA256(body, "${apiSecret}")`);
  console.log(`\n  Body (Rule 1 - Numeric Luhn, generate a valid 10-digit + luhn check):`);
  console.log(`  { "code": "<11-digit-code>", "project_id": "${project.id}" }`);
  console.log(`\n  Body (Rule 2 - Alphanumeric with prefix):`);
  console.log(`  { "code": "DN-2026-ABCD1234-X", "project_id": "${project.id}" }`);

  // Generate a sample valid code for Rule 1
  const samplePayload = '1234567890';
  const luhnCheck = luhnCalc(samplePayload);
  const sampleCode1 = samplePayload + luhnCheck;
  console.log(`\n  Sample valid code for Rule 1: ${sampleCode1}`);

  // Generate a sample valid code for Rule 3
  const batchSerial = '10012345';
  const mod10Check = mod10Calc(batchSerial);
  const sampleCode3 = batchSerial + mod10Check;
  console.log(`  Sample valid code for Rule 3: ${sampleCode3}`);

  // Show HMAC example
  const sampleBody = JSON.stringify({ code: sampleCode1, project_id: project.id });
  const sampleTimestamp = new Date().toISOString();
  const sampleSignature = createHmac('sha256', apiSecret).update(sampleBody).digest('hex');
  console.log(`\n  Example curl:`);
  console.log(`  curl -X POST http://localhost:3000/api/v1/validate \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "X-Api-Key: ${apiKey}" \\`);
  console.log(`    -H "X-Timestamp: ${sampleTimestamp}" \\`);
  console.log(`    -H "X-Signature: ${sampleSignature}" \\`);
  console.log(`    -d '${sampleBody}'`);
}

function luhnCalc(input: string): string {
  const digits = input.split('').map(Number).reverse();
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return ((10 - (sum % 10)) % 10).toString();
}

function mod10Calc(input: string): string {
  const sum = input.split('').reduce((acc, ch) => acc + parseInt(ch, 10), 0);
  return (sum % 10).toString();
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
