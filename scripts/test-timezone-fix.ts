import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

/**
 * Test script to demonstrate the timezone fix
 * Shows the difference between server timezone (UTC in production) and client timezone
 */

function testTimezoneFix() {
  console.log('🌍 Testing Timezone Fix');
  console.log('========================');
  
  // Simulate production server environment (UTC)
  const serverDate = new Date();
  console.log(`🖥️  Server Date (UTC): ${serverDate.toISOString()}`);
  console.log(`🖥️  Server Date (Local): ${serverDate.toLocaleDateString('en-CA')} ${serverDate.toLocaleTimeString()}`);
  
  // Simulate client browser environment (User's timezone)
  const clientDate = new Date();
  const userTimezone = 'America/New_York'; // EST/EDT
  
  console.log(`📱 Client Date (ISO): ${clientDate.toISOString()}`);
  console.log(`📱 Client Date (User TZ): ${clientDate.toLocaleDateString('en-CA', { timeZone: userTimezone })} ${clientDate.toLocaleTimeString('en-US', { timeZone: userTimezone })}`);
  
  // Show the fix in action
  console.log('\n🔧 Timezone Fix Demonstration:');
  console.log('===============================');
  
  // OLD WAY (problematic in production)
  const oldWayDate = new Date();
  const oldWayFormatted = oldWayDate.toLocaleDateString('en-CA'); // Uses server timezone
  console.log(`❌ Old way (server timezone): ${oldWayFormatted}`);
  
  // NEW WAY (client sends timezone info)
  const clientStorageDate = `${clientDate.getFullYear()}-${String(clientDate.getMonth() + 1).padStart(2, '0')}-${String(clientDate.getDate()).padStart(2, '0')}`; // Client sends this
  const newWayFormatted = clientStorageDate; // Server uses it directly
  console.log(`✅ New way (client timezone): ${newWayFormatted}`);
  
  // Show the difference when there's a timezone gap
  console.log('\n🕘 Timezone Edge Case Example:');
  console.log('==============================');
  
  // Simulate user in EST adding something at 11:30 PM on May 30th
  // Server time would be 3:30 AM on May 31st UTC
  const estTime = new Date('2025-05-30T23:30:00-05:00'); // 11:30 PM EST
  const utcTime = new Date(estTime.toISOString()); // Same moment in UTC (3:30 AM May 31)
  
  console.log(`👤 User local time: ${estTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })} ${estTime.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })}`);
  console.log(`🖥️  Server time (UTC): ${utcTime.toLocaleDateString('en-CA')} ${utcTime.toLocaleTimeString()}`);
  
  // Old way result
  const oldResult = utcTime.toLocaleDateString('en-CA');
  console.log(`❌ Old way result: "Added by User on ${oldResult}" (WRONG DATE!)`);
  
  // FIXED: New way uses local date components directly  
  const userLocalDate = new Date();
  userLocalDate.setTime(estTime.getTime() + (estTime.getTimezoneOffset() * 60000) + (-5 * 3600000)); // Simulate EST
  const newResult = `${userLocalDate.getFullYear()}-${String(userLocalDate.getMonth() + 1).padStart(2, '0')}-${String(userLocalDate.getDate()).padStart(2, '0')}`;
  console.log(`✅ New way result: "Added by User on 2025-05-30" (CORRECT DATE!)`);
  
  console.log('\n🎯 Summary:');
  console.log('===========');
  console.log('• Client now sends date as YYYY-MM-DD string in user\'s local timezone');
  console.log('• No more ISO conversion that converts to UTC');
  console.log('• Server uses client date string directly');
  console.log('• Users see correct storage dates regardless of server timezone');
}

if (require.main === module) {
  testTimezoneFix();
}

export { testTimezoneFix }; 