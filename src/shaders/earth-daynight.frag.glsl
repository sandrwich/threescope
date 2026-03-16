uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform sampler2D normalMap;
uniform sampler2D displacementMap;
uniform sampler2D cloudTexture;
uniform vec3 sunDir;
uniform vec3 moonPos;
uniform float moonRadius;
uniform float showNight;
uniform float nightEmission;
uniform float hasNormalMap;
uniform float aoEnabled;
uniform float hasDisplacement;
uniform vec3 viewPos;
uniform float cloudUVOffset;
uniform float showClouds;
uniform float showGlare;
uniform float showCloudShadows;
uniform float showRimScatter;

varying vec2 vUv;
varying vec3 vWorldPos;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float TEX_STEP = 1.0 / 2048.0;
const float AO_STRENGTH = 8.0;
const float EARTH_R = 6371.0;
const float SUN_ANG_R = 0.00465;
const float CLOUD_ALT = 25.0;

void main() {
    vec4 day = texture2D(dayTexture, vUv);

    // Curvature AO from displacement map
    float ao = 1.0;
    if (hasDisplacement > 0.5 && aoEnabled > 0.5) {
        float hC = texture2D(displacementMap, vUv).r;
        float hL = texture2D(displacementMap, vUv + vec2(-TEX_STEP, 0.0)).r;
        float hR = texture2D(displacementMap, vUv + vec2( TEX_STEP, 0.0)).r;
        float hD = texture2D(displacementMap, vUv + vec2(0.0, -TEX_STEP)).r;
        float hU = texture2D(displacementMap, vUv + vec2(0.0,  TEX_STEP)).r;
        float laplacian = (hL + hR + hD + hU) * 0.25 - hC;
        ao = clamp(1.0 - laplacian * AO_STRENGTH, 0.5, 1.0);
    }

    // Reconstruct geometric surface normal from UV (ECEF, needed for eclipse + terminator)
    float theta = (vUv.x - 0.5) * TWO_PI;
    float phi = vUv.y * PI;
    float sinPhi = sin(phi);
    float cosPhi = cos(phi);
    float sinTheta = sin(theta);
    float cosTheta = cos(theta);
    vec3 baseNormal = vec3(cosTheta * sinPhi, cosPhi, -sinTheta * sinPhi);

    // Solar eclipse shadow (Moon blocking Sun)
    float eclipseFactor = 1.0;
    float rawIntensity = dot(baseNormal, sunDir);
    if (rawIntensity > -0.15) {
        vec3 surfPos = baseNormal * EARTH_R;
        vec3 toMoon = moonPos - surfPos;
        float moonDist = length(toMoon);
        float sep = acos(clamp(dot(toMoon / moonDist, sunDir), -1.0, 1.0));
        float moonAngR = atan(moonRadius / moonDist);
        eclipseFactor = smoothstep(abs(moonAngR - SUN_ANG_R), moonAngR + SUN_ANG_R, sep);
    }

    if (showNight < 0.5) {
        gl_FragColor = day * ao * eclipseFactor;
        return;
    }

    vec4 night = texture2D(nightTexture, vUv, -2.0);
    if (nightEmission < 1.01) night.rgb *= 1.0 + smoothstep(0.05, 0.3, night.rgb) * 0.5;

    // Perturb normal with tangent-space normal map (for terminator shading, not eclipse)
    vec3 normal = baseNormal;
    if (hasNormalMap > 0.5) {
        vec3 T = normalize(vec3(-sinTheta * sinPhi, 0.0, -cosTheta * sinPhi));
        vec3 B = normalize(vec3(cosTheta * cosPhi, -sinPhi, -sinTheta * cosPhi));
        vec3 mapN = texture2D(normalMap, vUv).rgb * 2.0 - 1.0;
        normal = normalize(T * mapN.x + B * mapN.y + baseNormal * mapN.z);
    }

    float intensity = dot(normal, sunDir);
    float blend = smoothstep(-0.15, 0.15, intensity);

    // Sunset scattering: 2-stop gradient (deep red near night → warm orange near day)
    float scatterMult = smoothstep(-0.15, 0.25, intensity) * smoothstep(0.25, -0.15, intensity);
    vec3 sunsetDeep = vec3(0.85, 0.2, 0.08);
    vec3 sunsetWarm = vec3(1.0, 0.55, 0.2);
    float gradPos = smoothstep(-0.12, 0.12, intensity);
    vec3 sunsetColor = mix(sunsetDeep, sunsetWarm, gradPos);
    vec3 scatteredDay = mix(day.rgb * ao, day.rgb * ao * sunsetColor * 1.5, scatterMult * 0.15);

    // Surface haze: blue-to-sunset atmospheric haze near terminator
    vec3 hazeColor = mix(vec3(0.15, 0.35, 0.75), sunsetColor, scatterMult);
    float surfaceHaze = pow(max(1.0 - abs(intensity), 0.0), 2.0) * smoothstep(-0.1, 0.2, intensity) * 0.1;
    scatteredDay = mix(scatteredDay, hazeColor, surfaceHaze);

    // --- Cloud shadows via ray-sphere intersection ---
    float cloudShadow = 1.0;
    if (showClouds > 0.5 && showCloudShadows > 0.5 && rawIntensity > -0.1) {
        // Trace ray from surface point toward sun, find where it hits the cloud sphere
        vec3 surfPos = baseNormal * EARTH_R;
        float cloudR = EARTH_R + CLOUD_ALT;

        // Solve |surfPos + t*sunDir|² = cloudR²
        float b = 2.0 * dot(surfPos, sunDir);
        float c = EARTH_R * EARTH_R - cloudR * cloudR;
        float disc = b * b - 4.0 * c;

        // disc is always positive (surface is inside the cloud sphere)
        float t = (-b + sqrt(disc)) * 0.5;
        vec3 cloudHit = surfPos + t * sunDir;

        // Convert cloud intersection to equirectangular UV
        vec3 cn = normalize(cloudHit);
        float cloudTheta = atan(-cn.z, cn.x);
        float cloudPhi = acos(clamp(cn.y, -1.0, 1.0));
        vec2 cloudUV = vec2(cloudTheta / TWO_PI + 0.5, 1.0 - cloudPhi / PI);

        // Apply the rotation offset between earth and cloud layer
        cloudUV.x = fract(cloudUV.x + cloudUVOffset);

        float cloudAlpha = texture2D(cloudTexture, cloudUV).a;

        // Softer shadows on the day side, fade out near terminator
        float shadowDayMask = smoothstep(-0.05, 0.25, rawIntensity);
        float shadowStrength = showGlare > 0.5 ? 1.0 : 0.8;
        cloudShadow = 1.0 - cloudAlpha * shadowStrength * shadowDayMask;
        scatteredDay *= cloudShadow;
    }

    // --- Ocean specular (water glare / sun glint) ---
    if (showGlare > 0.5 && rawIntensity > 0.0) {
        vec3 viewDir = normalize(viewPos - baseNormal * EARTH_R);
        vec3 halfVec = normalize(sunDir + viewDir);

        float NdotV = max(dot(baseNormal, viewDir), 0.0);
        float NdotH = max(dot(normal, halfVec), 0.0);
        float NdotL = max(rawIntensity, 0.0);

        // Fresnel (Schlick) — water F0 ≈ 0.02
        float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

        // Ocean mask: blue-dominant pixels with low green/red
        float waterMask = clamp((day.b - max(day.r, day.g)) * 3.0, 0.0, 1.0);

        // Two-lobe specular: tight sun disk + broad Fresnel rim
        float specTight = pow(NdotH, 256.0);
        float specBroad = pow(NdotH, 16.0);
        float spec = specTight * 3.0 + specBroad * 0.15;

        // Sun color: warm white at high angles, reddish near horizon
        vec3 sunColor = mix(vec3(1.0, 0.7, 0.4), vec3(1.0, 0.95, 0.9), NdotL);

        // Cloud shadow suppresses glare — no sun reflection under clouds
        vec3 glare = sunColor * spec * fresnel * waterMask * NdotL * cloudShadow;

        // Roughness from normal map breaks up the glare naturally
        scatteredDay += glare;
    }

    // Atmospheric rim scatter — blue tint at the limb where surface curves away
    if (showRimScatter > 0.5) {
        vec3 rimViewDir = normalize(viewPos - baseNormal * EARTH_R);
        float rimNdotV = max(dot(baseNormal, rimViewDir), 0.0);
        float rim = pow(1.0 - rimNdotV, 4.0) * smoothstep(-0.1, 0.3, rawIntensity);
        scatteredDay += vec3(0.25, 0.58, 1.0) * rim;
    }

    // Boost night emission for bloom (HDR values > 1.0)
    vec4 boostedNight = vec4(night.rgb * nightEmission, night.a);
    // Eclipse: blend day toward night lights instead of black
    vec4 dayColor = mix(boostedNight, vec4(scatteredDay, day.a), eclipseFactor);
    gl_FragColor = mix(boostedNight, dayColor, blend);
}
