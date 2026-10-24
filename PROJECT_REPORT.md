# AegisCore — Comprehensive Project Technical & Architectural Report

**System Name:** AegisCore Disaster Intelligence Platform  
**Target Region:** Karnataka State Pilot Sectors (Kodagu, Uttara Kannada, Belagavi, Bagalkot)  
**Version:** 2.4.0 (Calibrated Operational Pilot)  
**Release Date:** September 2026  

---

## 1. Executive Summary

AegisCore is an AI-driven, multi-hazard disaster intelligence and emergency response platform designed for sub-district and district disaster management authorities and citizens in Karnataka. The platform couples frozen long short-term memory (LSTM) deep sequence models with district-specific empirical calibration, real-time spatial analytics, dynamic operational alert synchronization, and emergency distress dispatch.

---

## 2. Monitored Geographic Sectors & Environmental Basins

| District | River Basins & Hydrologic Systems | Dominant Hazard Profiles | Monitored Critical Reaches |
| :--- | :--- | :--- | :--- |
| **Kodagu** | Cauvery & Harangi River Basins | Flash Flooding & Western Ghats Slope Instability | Kushalnagar riparian reach, Somwarpet catchment, Madikeri hill corridors |
| **Uttara Kannada** | Kali, Sharavathi & Aghanashini Estuarine Basins | Coastal Flood Inundation & Escarpment Landslides | Karwar Kali estuary, Honnavar Sharavathi estuary, Kumta Aghanashini plain |
| **Belagavi** | Krishna, Malaprabha & Ghataprabha River Systems | Riverine Overflow & Backwater Submergence | Chikkodi Krishna–Doodhganga confluence, Gokak Ghataprabha gorge, Athani plain |
| **Bagalkot** | Ghataprabha, Malaprabha & Krishna Confluences | Heavy Reservoir Inflows & Lowland Inundation | Jamkhandi Hipparagi barrage reach, Mudhol Ghataprabha reach, Badami basin |

---

## 3. Safe Relief Shelter Operations Network

### 3.1 Pilot Infrastructure & Anchor Category
In the current operational release, AegisCore monitors **16 verified public relief center anchors** (4 per monitored pilot district). All anchors are established in prominent, publicly findable municipal and state facilities—such as government model colleges, community halls, and taluk sports complexes—strategically situated outside immediate floodway zones yet adjacent to critical evacuation transit routes.

```
                           [ AegisCore Relief Network ]
                                        │
     ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
     ▼                  ▼                               ▼                  ▼
[ Kodagu (4) ]   [ Uttara Kannada (4) ]          [ Belagavi (4) ]   [ Bagalkot (4) ]
 - Madikeri TC    - Karwar Sports Complex         - Nehru Stadium    - Sector 5 Hall
 - Somwarpet HS   - Honnavar Community Hall       - Chikkodi Model   - Jamkhandi Royal
 - Kushalnagar JC - Kumta Govt PU College         - Gokak Town Hall  - Mudhol Polytechnic
 - Virajpet Stad. - Sirsi Municipal Stadium       - Athani Comm Ctr  - Badami School
```

### 3.2 District Shelter Inventory & Proximity to River Reaches

#### A. Kodagu District (Total Capacity: 1,700 beds)
1. **Madikeri Community Relief Camp** (Town Hall Compound, Madikeri)
   - Coordinates: `12.4245° N, 75.7380° E` | Capacity: 600 beds
   - Strategic Anchor: Upland district headquarters coordination center with integrated medical and triage facilities.
2. **Somwarpet High School Shelter** (Main Road, Somwarpet)
   - Coordinates: `12.5975° N, 75.8497° E` | Capacity: 300 beds
   - Strategic Anchor: Upper Harangi basin reach; serves agricultural settlements along northern taluk roads.
3. **Kushalnagar Government Junior College Relief Camp** (BM Road, Kushalnagar)
   - Coordinates: `12.4630° N, 75.9610° E` | Capacity: 450 beds
   - Strategic Anchor: Situated adjacent to the critical Cauvery–Harangi river confluence corridor, serving low-lying riparian residential zones.
4. **Virajpet Taluk Stadium & Community Pavilion** (Hospital Road, Virajpet)
   - Coordinates: `12.2025° N, 75.8035° E` | Capacity: 350 beds
   - Strategic Anchor: Southern Kodagu Cauvery tributary reach; elevated community recreation complex with open relief staging grounds.

#### B. Uttara Kannada District (Total Capacity: 1,800 beds)
1. **Karwar Relief Operations Hub** (District Sports Complex, Karwar)
   - Coordinates: `14.8120° N, 74.1305° E` | Capacity: 550 beds
   - Strategic Anchor: Kali river estuary and coastal harbor sector; direct deep-water and rescue boat access.
2. **Honnavar St. Anthony Community Hall Relief Camp** (NH-66 Coastal Highway, Honnavar)
   - Coordinates: `14.2810° N, 74.4440° E` | Capacity: 400 beds
   - Strategic Anchor: Sharavathi river estuary reach; rapid evacuation hub for fishermen colonies and estuarine agricultural tracts.
3. **Kumta Government PU College Relief Shelter** (Gibb Circle, Kumta)
   - Coordinates: `14.4270° N, 74.4230° E` | Capacity: 350 beds
   - Strategic Anchor: Aghanashini river estuarine reach; fortified masonry structures equipped for cyclone and flood displacement.
4. **Sirsi Municipal Stadium & Community Center** (Hubli Road, Sirsi)
   - Coordinates: `14.6190° N, 74.8480° E` | Capacity: 500 beds
   - Strategic Anchor: Western Ghats ridge plateau; high-elevation reception center for evacuees from hillside landslide zones.

#### C. Belagavi District (Total Capacity: 2,350 beds)
1. **Belagavi Flood Evacuation Hub** (Nehru Stadium Complex, Belagavi)
   - Coordinates: `15.8690° N, 74.5020° E` | Capacity: 800 beds
   - Strategic Anchor: Major metropolitan relief center with helipad staging, mass community kitchens, and medical depot access.
2. **Chikkodi Government Model Higher Primary School** (Station Road, Chikkodi)
   - Coordinates: `16.4320° N, 74.5980° E` | Capacity: 600 beds
   - Strategic Anchor: Krishna–Doodhganga confluence corridor; critical staging post for chronic flood villages along river bends.
3. **Gokak Municipal Town Hall & Sports Pavilion** (Falls Road, Gokak)
   - Coordinates: `16.1680° N, 74.8250° E` | Capacity: 450 beds
   - Strategic Anchor: Ghataprabha river reach; elevated town center above historic urban flash inundation levels.
4. **Athani Taluk Community Center** (Court Road, Athani)
   - Coordinates: `16.7310° N, 75.0620° E` | Capacity: 500 beds
   - Strategic Anchor: Northern Krishna river plain; serves farming populations displaced by upstream Maharashtra dam discharge.

#### D. Bagalkot District (Total Capacity: 1,800 beds)
1. **Bagalkot Town Relief Camp** (Sector 5 Community Hall, Bagalkot)
   - Coordinates: `16.1620° N, 75.6415° E` | Capacity: 400 beds
   - Strategic Anchor: Navanagar resettlement sector, positioned safely above Almatti reservoir maximum backwater levels.
2. **Jamkhandi Royal Palace Grounds Community Shelter** (Kaveri Road, Jamkhandi)
   - Coordinates: `16.5080° N, 75.2970° E` | Capacity: 650 beds
   - Strategic Anchor: Hipparagi barrage and Krishna riverbank reach; large open-perimeter facility capable of handling dense village evacuations.
3. **Mudhol Government Polytechnic Relief Center** (Yadwad Road, Mudhol)
   - Coordinates: `16.3350° N, 75.2850° E` | Capacity: 400 beds
   - Strategic Anchor: Ghataprabha floodplain reach; multi-wing technical institute with independent backup power and water storage.
4. **Badami Veerpulikeshi School Complex** (Station Road, Badami)
   - Coordinates: `15.9180° N, 75.6810° E` | Capacity: 350 beds
   - Strategic Anchor: Malaprabha river valley basin; secure masonry campus serving historic rock-cut valley communities.

---

### 3.3 Dynamic Capacity Strain Classification

The system computes real-time shelter logistics strain using dynamic occupancy telemetry:

$$\text{Utilization Percentage} = \frac{\sum \text{Occupied Beds}}{\sum \text{Total Capacity}} \times 100$$

- **High Strain ($\ge 85\%$ or any shelter Full):** Coded Orange/Amber on map centroids and dashboard breakdown cards. Flags urgent need for secondary overflow centers.
- **Moderate Strain ($50\% - 84\%$):** Coded Yellow; indicates normal active operational reception.
- **Available ($< 50\%$):** Coded Emerald Green; represents ample standby evacuation capacity.

---

## 4. Formal Operational Scope & Mandate for DDMA Coordination

> [!IMPORTANT]
> ### Pilot Deployment Scope & NDMA Guideline Notice
> **Shelter coverage in this software version represents an initial pilot deployment.**  
> The 16 relief centers configured in AegisCore serve as verified proof-of-concept and operational demonstration anchors situated near primary river reaches.
> 
> **Requirements for Full-Scale Field Deployment:**
> 1. **Official DDMA Coordination:** Full-scale production deployment requires formal integration and coordination with the respective **District Disaster Management Authorities (DDMAs)** across Karnataka (e.g., DDMA Kodagu, DDMA Belagavi, DDMA Bagalkot, DDMA Uttara Kannada).
> 2. **NDMA Shelter-Density Standard:** Operational relief networks must be surveyed and validated to fulfill **National Disaster Management Authority (NDMA) shelter-density guidelines**, ensuring an effective coverage radius of **10–15 km per high-risk settlement zone**.
> 3. **Geo-Fenced Evacuation Corridors:** Production rollout will map formal muster points, designated flood bypass corridors, and integrate verified taluk-level school and community registries under official district administration oversight.

---

## 5. Machine Learning, Calibration & Verification Pipeline

1. **Frozen M11 LSTM Engine:** Deep neural sequence architecture consuming daily multi-variate environmental metrics (rainfall, streamflow, volumetric soil moisture, temperature, pressure).
2. **Level 2 District Calibration:** Raw neural probabilities are transformed through empirical sigmoid/isotonic curves derived from historical sensor records to eliminate model overconfidence.
3. **Pipeline Synchronization:** Predictions generated via the live prediction pipeline (`POST /predictions/trigger`) simultaneously update MongoDB records, emit Socket.io broadcasts, and reflect identically across the **Tactical Overview**, **Risk Analysis**, and **AI Prediction Center** pages.
