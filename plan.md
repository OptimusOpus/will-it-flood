# Brisbane Flood Risk Assessment: Technical Implementation Guide

## API integration reveals surprising complexity in Brisbane's flood data infrastructure

Brisbane's flood risk assessment requires navigating multiple data systems: the Council's CKAN-based flood API provides comprehensive risk metrics through RESTful endpoints, [Brisbane +3](https://www.brisbane.qld.gov.au/community-and-safety/community-safety/disasters-and-emergencies/be-prepared/flooding-in-brisbane/flood-awareness-map?
                (chunk['locality'].str.contains('BRISBANE', case=False, na=False))
            ]
            
            # Clean and normalize
            brisbane_chunk = self.normalize_addresses(brisbane_chunk)
            
            yield brisbane_chunk
    
    def normalize_addresses(self, df: pd.DataFrame) -> pd.DataFrame:
        """Normalize address components"""
        # Handle null values
        df = df.fillna('')
        
        # Standardize text fields
        text_columns = ['street_name', 'locality', 'street_type']
        for col in text_columns:
            df[col] = df[col].str.upper().str.strip()
        
        # Create composite address field
        df['full_address'] = df.apply(self._build_address, axis=1)
        
        return df
    
    def _build_address(self, row: pd.Series) -> str:
        """Build standardized address string"""
        parts = []
        
        if row['unit_number']:
            parts.append(f"Unit {row['unit_number']}")
        
        if row['street_number']:
            parts.append(row['street_number'])
            
        if row['street_name']:
            street = row['street_name']
            if row['street_type']:
                street += f" {row['street_type']}"
            parts.append(street)
        
        if row['locality']:
            parts.append(row['locality'])
            
        if row['postcode']:
            parts.append(f"QLD {row['postcode']}")
            
        return ', '.join(parts)
```

### Alternative API access via PLSplus

For real-time address validation without bulk processing: [Data](https://www.data.qld.gov.au/dataset/property-location-service-plus-public-json? ' in address or ' AND ' in address:
            parts = re.split(r'\s+(?:&|AND)\s+', address)
            if len(parts) == 2:
                components['street_name_1'] = parts[0]
                components['street_name_2'] = parts[1]
                components['is_corner'] = True
        
        return components
    
    def fuzzy_match_address(
        self, 
        input_address: str, 
        candidates: List[str], 
        threshold: float = 0.8
    ) -> List[Tuple[str, float]]:
        """Fuzzy match against candidate addresses"""
        # Parse input address
        input_parsed = self.parse_address(input_address)
        
        matches = []
        for candidate in candidates:
            candidate_parsed = self.parse_address(candidate)
            
            # Calculate component-wise scores
            scores = {
                'unit': self._compare_component(
                    input_parsed.get('unit_number'),
                    candidate_parsed.get('unit_number'),
                    exact_only=True
                ),
                'street_number': self._compare_component(
                    input_parsed.get('street_number'),
                    candidate_parsed.get('street_number'),
                    exact_only=True
                ),
                'street_name': self._compare_component(
                    input_parsed.get('street_name'),
                    candidate_parsed.get('street_name'),
                    fuzzy=True
                ),
                'suburb': self._compare_component(
                    input_parsed.get('suburb'),
                    candidate_parsed.get('suburb'),
                    fuzzy=True
                ),
                'postcode': self._compare_component(
                    input_parsed.get('postcode'),
                    candidate_parsed.get('postcode'),
                    exact_only=True
                )
            }
            
            # Weighted scoring
            weights = {
                'unit': 0.15,
                'street_number': 0.25,
                'street_name': 0.30,
                'suburb': 0.20,
                'postcode': 0.10
            }
            
            total_score = sum(
                scores[k] * weights[k] for k in scores
            )
            
            if total_score >= threshold:
                matches.append((candidate, total_score))
        
        # Sort by score descending
        matches.sort(key=lambda x: x[1], reverse=True)
        
        return matches
    
    def _compare_component(
        self, 
        comp1: Optional[str], 
        comp2: Optional[str],
        exact_only: bool = False,
        fuzzy: bool = False
    ) -> float:
        """Compare address components with appropriate method"""
        if comp1 is None or comp2 is None:
            return 0.0 if comp1 != comp2 else 1.0
        
        comp1 = str(comp1).upper().strip()
        comp2 = str(comp2).upper().strip()
        
        if exact_only:
            return 1.0 if comp1 == comp2 else 0.0
        
        if fuzzy:
            return fuzz.ratio(comp1, comp2) / 100.0
        
        # Default: exact match
        return 1.0 if comp1 == comp2 else 0.0
```

### Handling complex Brisbane address formats

```python
class ComplexAddressHandler:
    def handle_rural_address(self, address: str) -> Dict:
        """Parse rural Queensland addresses"""
        # Pattern: Property Name, Near Town Postcode
        rural_pattern = r'^(.+?),\s*(?:NEAR|NR)\s+(.+?)\s+QLD\s+(\d{4})$'
        match = re.match(rural_pattern, address.upper())
        
        if match:
            return {
                'property_name': match.group(1),
                'nearest_town': match.group(2),
                'postcode': match.group(3),
                'address_type': 'rural'
            }
        
        return None
    
    def handle_strata_address(self, address: str) -> Dict:
        """Parse strata title addresses"""
        # Pattern: SP123456 or BUP123456
        strata_pattern = r'\b(SP|BUP|BMS|GTP)(\d{5,6})\b'
        match = re.search(strata_pattern, address.upper())
        
        if match:
            return {
                'plan_type': match.group(1),
                'plan_number': match.group(2),
                'is_strata': True
            }
        
        return None
```

## Production-ready technical architecture

Based on the research, here's the recommended technology stack and implementation approach:

### Database architecture with PostgreSQL + PostGIS

```sql
-- Core schema design
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For fuzzy text matching

-- Address lookup table with spatial indexing
CREATE TABLE brisbane_addresses (
    id SERIAL PRIMARY KEY,
    address_pid VARCHAR(50) UNIQUE NOT NULL,
    lot_no VARCHAR(20),
    plan_no VARCHAR(20),
    unit_number VARCHAR(10),
    street_number VARCHAR(10),
    street_name VARCHAR(100),
    street_type VARCHAR(20),
    suburb VARCHAR(50),
    postcode CHAR(4),
    full_address TEXT,
    geom GEOMETRY(Point, 4326),
    confidence_score FLOAT,
    last_validated TIMESTAMP,
    CONSTRAINT valid_postcode CHECK (postcode ~ '^\d{4}$')
);

-- Optimized indexes for address matching
CREATE INDEX idx_addresses_lot_plan ON brisbane_addresses(lot_no, plan_no);
CREATE INDEX idx_addresses_composite ON brisbane_addresses(suburb, street_name, street_number);
CREATE INDEX idx_addresses_fulltext ON brisbane_addresses USING gin(to_tsvector('english', full_address));
CREATE INDEX idx_addresses_trigram ON brisbane_addresses USING gin(street_name gin_trgm_ops);
CREATE INDEX idx_addresses_geom ON brisbane_addresses USING GIST(geom);

-- Flood risk cache table
CREATE TABLE flood_risk_cache (
    id SERIAL PRIMARY KEY,
    address_pid VARCHAR(50) REFERENCES brisbane_addresses(address_pid),
    flood_likelihood VARCHAR(20),
    flood_source VARCHAR(50),
    overland_flow_impact VARCHAR(20),
    historical_floods JSONB,
    api_response JSONB,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ttl_expires TIMESTAMP,
    CONSTRAINT valid_likelihood CHECK (flood_likelihood IN ('HIGH', 'MEDIUM', 'LOW', 'VERY_LOW', 'NONE'))
);

-- Spatial function for flood risk assessment
CREATE OR REPLACE FUNCTION assess_flood_risk(
    property_geom GEOMETRY,
    buffer_meters FLOAT DEFAULT 10
)
RETURNS TABLE (
    risk_level TEXT,
    flood_source TEXT,
    likelihood_aep FLOAT,
    distance_meters FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fr.risk_level,
        fr.flood_source,
        fr.aep_percentage,
        ST_Distance(property_geom::geography, fr.geom::geography) as distance_meters
    FROM flood_zones fr
    WHERE ST_DWithin(
        property_geom::geography, 
        fr.geom::geography, 
        buffer_meters
    )
    ORDER BY fr.aep_percentage DESC, distance_meters ASC;
END;
$$ LANGUAGE plpgsql;
```

### High-performance caching with Redis

```javascript
const Redis = require('ioredis');
const { createHash } = require('crypto');

class FloodRiskCache {
    constructor() {
        this.redis = new Redis({
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true
        });
        
        // TTL configuration (in seconds)
        this.ttl = {
            floodRisk: 3600,        // 1 hour for flood risk data
            geocoding: 604800,      // 7 days for geocoding results
            addressValidation: 86400 // 24 hours for address validation
        };
    }
    
    async getFloodRisk(addressPid) {
        const key = `flood:risk:${addressPid}`;
        const cached = await this.redis.get(key);
        
        if (cached) {
            return JSON.parse(cached);
        }
        
        return null;
    }
    
    async setFloodRisk(addressPid, data) {
        const key = `flood:risk:${addressPid}`;
        await this.redis.setex(
            key,
            this.ttl.floodRisk,
            JSON.stringify(data)
        );
    }
    
    async cacheWithGeoProximity(lat, lng, radius, data) {
        // Use Redis GEO commands for spatial caching
        const geoKey = 'flood:geo:brisbane';
        const dataKey = `flood:data:${this.hashCoords(lat, lng)}`;
        
        // Store location
        await this.redis.geoadd(geoKey, lng, lat, dataKey);
        
        // Store data
        await this.redis.setex(
            dataKey,
            this.ttl.floodRisk,
            JSON.stringify(data)
        );
    }
    
    async getNearbyFloodData(lat, lng, radiusMeters) {
        const geoKey = 'flood:geo:brisbane';
        
        // Find nearby cached points
        const nearby = await this.redis.georadius(
            geoKey,
            lng,
            lat,
            radiusMeters,
            'm',
            'WITHDIST',
            'COUNT',
            10
        );
        
        // Retrieve data for nearby points
        const results = [];
        for (const [dataKey, distance] of nearby) {
            const data = await this.redis.get(dataKey);
            if (data) {
                results.push({
                    data: JSON.parse(data),
                    distance: parseFloat(distance)
                });
            }
        }
        
        return results;
    }
    
    hashCoords(lat, lng, precision = 6) {
        const rounded = `${lat.toFixed(precision)},${lng.toFixed(precision)}`;
        return createHash('md5').update(rounded).digest('hex');
    }
}
```

### Queue-based processing for scalability

```javascript
const Bull = require('bull');
const { RateLimiter } = require('limiter');

class FloodAssessmentQueue {
    constructor() {
        // Initialize queue with Redis backend
        this.queue = new Bull('flood-assessment', {
            redis: {
                host: 'localhost',
                port: 6379
            },
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 50,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                }
            }
        });
        
        // Rate limiter for API calls (10 req/sec)
        this.rateLimiter = new RateLimiter({
            tokensPerInterval: 10,
            interval: 'second'
        });
        
        this.setupWorkers();
    }
    
    setupWorkers() {
        // Process flood assessment jobs
        this.queue.process('assess', 5, async (job) => {
            const { address, addressPid, priority } = job.data;
            
            try {
                // Rate limit API calls
                await this.rateLimiter.removeTokens(1);
                
                // Step 1: Geocode if needed
                let coords;
                if (!job.data.lat || !job.data.lng) {
                    coords = await this.geocodeAddress(address);
                } else {
                    coords = { lat: job.data.lat, lng: job.data.lng };
                }
                
                // Step 2: Check cache
                const cached = await this.cache.getNearbyFloodData(
                    coords.lat,
                    coords.lng,
                    50 // 50m radius
                );
                
                if (cached.length > 0 && cached[0].distance < 10) {
                    return cached[0].data;
                }
                
                // Step 3: Call flood API
                const floodData = await this.callFloodAPI(addressPid);
                
                // Step 4: Cache results
                await this.cache.cacheWithGeoProximity(
                    coords.lat,
                    coords.lng,
                    50,
                    floodData
                );
                
                return floodData;
                
            } catch (error) {
                console.error(`Job ${job.id} failed:`, error);
                throw error;
            }
        });
        
        // Handle batch processing
        this.queue.process('batch', 2, async (job) => {
            const { addresses } = job.data;
            const results = [];
            
            for (const address of addresses) {
                const childJob = await this.queue.add('assess', address, {
                    priority: 5
                });
                
                results.push({
                    jobId: childJob.id,
                    addressPid: address.addressPid
                });
            }
            
            return results;
        });
    }
    
    async addAssessment(address, options = {}) {
        return await this.queue.add('assess', {
            address: address.fullAddress,
            addressPid: address.addressPid,
            lat: address.latitude,
            lng: address.longitude,
            priority: options.priority || 'normal'
        }, {
            priority: options.priority === 'high' ? 1 : 10,
            delay: options.delay || 0
        });
    }
}
```

### Complete integration example

```javascript
class FloodRiskAssessmentSystem {
    constructor(config) {
        this.db = new PostgreSQLClient(config.database);
        this.cache = new FloodRiskCache();
        this.queue = new FloodAssessmentQueue();
        this.addressParser = new BrisbaneAddressParser();
        this.floodAPI = new BrisbaneFloodAPI(config.floodAPI);
    }
    
    async assessProperty(inputAddress) {
        try {
            // Step 1: Parse and normalize address
            const parsed = this.addressParser.parse_address(inputAddress);
            
            // Step 2: Find in database
            let dbAddress = await this.db.findAddress(parsed);
            
            if (!dbAddress) {
                // Step 3: Geocode and validate
                const validated = await this.validateWithPLSplus(inputAddress);
                
                if (validated.confidence < 0.7) {
                    // Queue for manual review
                    await this.queueManualReview(inputAddress, validated);
                    throw new Error('Address requires manual review');
                }
                
                // Save to database
                dbAddress = await this.db.saveAddress(validated);
            }
            
            // Step 4: Check flood risk cache
            let floodRisk = await this.cache.getFloodRisk(dbAddress.addressPid);
            
            if (!floodRisk) {
                // Step 5: Queue flood assessment
                const job = await this.queue.addAssessment(dbAddress, {
                    priority: 'normal'
                });
                
                // Wait for completion
                const result = await job.finished();
                floodRisk = result;
            }
            
            // Step 6: Return comprehensive result
            return {
                address: dbAddress,
                floodRisk: floodRisk,
                confidence: dbAddress.confidenceScore,
                assessedAt: new Date()
            };
            
        } catch (error) {
            console.error('Assessment failed:', error);
            throw error;
        }
    }
    
    async bulkAssess(csvFilePath) {
        // Process large CSV files efficiently
        const processor = new QueenslandAddressProcessor(csvFilePath);
        const batchSize = 100;
        let batch = [];
        
        for await (const chunk of processor.process_addresses()) {
            for (const address of chunk.iterrows()) {
                batch.push(address);
                
                if (batch.length >= batchSize) {
                    await this.queue.add('batch', {
                        addresses: batch
                    });
                    batch = [];
                }
            }
        }
        
        // Process remaining
        if (batch.length > 0) {
            await this.queue.add('batch', { addresses: batch });
        }
    }
}
```

## Implementation checklist and next steps

To successfully implement this flood risk assessment system:

**Immediate actions:**
1. Obtain the actual resource ID for Brisbane's flood dataset from the data portal [Data](https://www.data.qld.gov.au/dataset/?organization=brisbane-city-council