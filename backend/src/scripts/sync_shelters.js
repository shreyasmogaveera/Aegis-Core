const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Shelter = require('../models/Shelter');

async function syncShelters() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.');

  const sheltersData = [
    // Kodagu (Cauvery and Harangi River Basins)
    {
      name: 'Madikeri Community Relief Camp',
      address: 'Town Hall Compound, Madikeri',
      district: 'Kodagu',
      location: { type: 'Point', coordinates: [75.7380, 12.4245] },
      capacity: 600,
      occupied: 420,
      status: 'OPEN',
      contactPhone: '+91 8272228800',
      facilities: ['Medical Center', 'Food Supply', 'Clean Water', '600 Beds', 'Sanitation']
    },
    {
      name: 'Somwarpet High School Shelter',
      address: 'Main Road, Somwarpet',
      district: 'Kodagu',
      location: { type: 'Point', coordinates: [75.8497, 12.5975] },
      capacity: 300,
      occupied: 115,
      status: 'OPEN',
      contactPhone: '+91 8276282100',
      facilities: ['Food Supply', 'Water', 'Emergency Power']
    },
    {
      name: 'Kushalnagar Government Junior College Relief Camp',
      address: 'BM Road, Kushalnagar',
      district: 'Kodagu',
      location: { type: 'Point', coordinates: [75.9610, 12.4630] },
      capacity: 450,
      occupied: 180,
      status: 'OPEN',
      contactPhone: '+91 8276274200',
      facilities: ['Food Supply', 'Clean Water', 'First Aid', 'Emergency Power']
    },
    {
      name: 'Virajpet Taluk Stadium & Community Pavilion',
      address: 'Hospital Road, Virajpet',
      district: 'Kodagu',
      location: { type: 'Point', coordinates: [75.8035, 12.2025] },
      capacity: 350,
      occupied: 85,
      status: 'OPEN',
      contactPhone: '+91 8274256300',
      facilities: ['Large Open Shelter', 'Sanitation', 'Drinking Water']
    },

    // Uttara Kannada (Kali, Sharavathi, and Aghanashini River Basins)
    {
      name: 'Karwar Relief Operations Hub',
      address: 'District Sports Complex, Karwar',
      district: 'Uttara Kannada',
      location: { type: 'Point', coordinates: [74.1305, 14.8120] },
      capacity: 550,
      occupied: 220,
      status: 'OPEN',
      contactPhone: '+91 8382226000',
      facilities: ['Rescue Boat Access', 'Food Supply', 'Medical Team']
    },
    {
      name: 'Honnavar St. Anthony Community Hall Relief Camp',
      address: 'NH-66 Coastal Highway, Honnavar',
      district: 'Uttara Kannada',
      location: { type: 'Point', coordinates: [74.4440, 14.2810] },
      capacity: 400,
      occupied: 130,
      status: 'OPEN',
      contactPhone: '+91 8387220400',
      facilities: ['Food Supply', 'Clean Water', 'Emergency Generator', 'First Aid']
    },
    {
      name: 'Kumta Government PU College Relief Shelter',
      address: 'Gibb Circle, Kumta',
      district: 'Uttara Kannada',
      location: { type: 'Point', coordinates: [74.4230, 14.4270] },
      capacity: 350,
      occupied: 90,
      status: 'OPEN',
      contactPhone: '+91 8386222100',
      facilities: ['Drinking Water', 'Sanitation', 'Dry Rations']
    },
    {
      name: 'Sirsi Municipal Stadium & Community Center',
      address: 'Hubli Road, Sirsi',
      district: 'Uttara Kannada',
      location: { type: 'Point', coordinates: [74.8480, 14.6190] },
      capacity: 500,
      occupied: 140,
      status: 'OPEN',
      contactPhone: '+91 8384226500',
      facilities: ['Medical Center', 'Community Kitchen', 'Bedding', 'Clean Water']
    },

    // Belagavi (Krishna, Malaprabha, and Ghataprabha River Basins)
    {
      name: 'Belagavi Flood Evacuation Hub',
      address: 'Nehru Stadium Complex, Belagavi',
      district: 'Belagavi',
      location: { type: 'Point', coordinates: [74.5020, 15.8690] },
      capacity: 800,
      occupied: 340,
      status: 'OPEN',
      contactPhone: '+91 8312400000',
      facilities: ['Large Capacity', 'Helipad Access', 'Community Kitchen']
    },
    {
      name: 'Chikkodi Government Model Higher Primary School',
      address: 'Station Road, Chikkodi',
      district: 'Belagavi',
      location: { type: 'Point', coordinates: [74.5980, 16.4320] },
      capacity: 600,
      occupied: 220,
      status: 'OPEN',
      contactPhone: '+91 8338272100',
      facilities: ['Emergency Kitchen', 'Water Tankers', 'First Aid Clinic']
    },
    {
      name: 'Gokak Municipal Town Hall & Sports Pavilion',
      address: 'Falls Road, Gokak',
      district: 'Belagavi',
      location: { type: 'Point', coordinates: [74.8250, 16.1680] },
      capacity: 450,
      occupied: 160,
      status: 'OPEN',
      contactPhone: '+91 8332225400',
      facilities: ['Clean Water', 'Food Supply', 'Sanitation']
    },
    {
      name: 'Athani Taluk Community Center',
      address: 'Court Road, Athani',
      district: 'Belagavi',
      location: { type: 'Point', coordinates: [75.0620, 16.7310] },
      capacity: 500,
      occupied: 110,
      status: 'OPEN',
      contactPhone: '+91 8289251200',
      facilities: ['Bedding', 'Food Supply', 'Emergency Lighting']
    },

    // Bagalkot (Ghataprabha, Malaprabha, and Krishna Confluence Basins)
    {
      name: 'Bagalkot Town Relief Camp',
      address: 'Sector 5 Community Hall, Bagalkot',
      district: 'Bagalkot',
      location: { type: 'Point', coordinates: [75.6415, 16.1620] },
      capacity: 400,
      occupied: 150,
      status: 'OPEN',
      contactPhone: '+91 8354220000',
      facilities: ['Food Supply', 'Medical Assistance', 'Clean Water']
    },
    {
      name: 'Jamkhandi Royal Palace Grounds Community Shelter',
      address: 'Kaveri Road, Jamkhandi',
      district: 'Bagalkot',
      location: { type: 'Point', coordinates: [75.2970, 16.5080] },
      capacity: 650,
      occupied: 240,
      status: 'OPEN',
      contactPhone: '+91 8353220100',
      facilities: ['High Capacity', 'Open Grounds', 'Water Supply', 'Food Relief']
    },
    {
      name: 'Mudhol Government Polytechnic Relief Center',
      address: 'Yadwad Road, Mudhol',
      district: 'Bagalkot',
      location: { type: 'Point', coordinates: [75.2850, 16.3350] },
      capacity: 400,
      occupied: 130,
      status: 'OPEN',
      contactPhone: '+91 8350280400',
      facilities: ['Shelter Hall', 'Medical Aid', 'Clean Water', 'Sanitation']
    },
    {
      name: 'Badami Veerpulikeshi School Complex',
      address: 'Station Road, Badami',
      district: 'Bagalkot',
      location: { type: 'Point', coordinates: [75.6810, 15.9180] },
      capacity: 350,
      occupied: 70,
      status: 'OPEN',
      contactPhone: '+91 8357220200',
      facilities: ['Basic Bedding', 'Food Storage', 'Emergency Water']
    }
  ];

  await Shelter.deleteMany({});
  const inserted = await Shelter.insertMany(sheltersData);
  console.log(`Successfully synced ${inserted.length} shelters into MongoDB.`);

  const list = await Shelter.find({}, 'name district capacity occupied location');
  const districtCounts = {};
  for (const s of list) {
    districtCounts[s.district] = (districtCounts[s.district] || 0) + 1;
  }
  console.log('District Shelter Counts:', districtCounts);
  console.log('Total Shelters in DB:', list.length);

  await mongoose.disconnect();
}

syncShelters().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
