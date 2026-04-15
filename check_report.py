import json
import os

# Check latest report
reports_dir = "agentqa/backend/reports"
reports = sorted([f for f in os.listdir(reports_dir) if f.endswith(".json")], reverse=True)

if reports:
    latest = reports[0]
    path = os.path.join(reports_dir, latest)
    
    with open(path) as f:
        r = json.load(f)
    
    print(f"📄 Latest Report: {latest}")
    print(f"🏢 Repository: {r.get('repo', 'unknown')}")
    print(f"📊 Mutation Score: {r['summary'].get('mutation_score_pct', 'N/A')}")
    print(f"✅ Tests Generated: {r['summary'].get('tests_generated', 0)}")
    print(f"🎯 Pass Rate: {r['summary'].get('pass_rate_pct', 0)}%")
    print(f"💡 Mutation Reason: {r['summary'].get('mutation_score_reason', 'N/A')}")
    
    # Check for mutation detail errors
    if 'executor_meta' in r and 'mutation_detail' in r['executor_meta']:
        md = r['executor_meta']['mutation_detail']
        print(f"\n🔬 Mutation Detail Reason: {md.get('reason', 'N/A')}")
        if 'raw_output_excerpt' in md:
            excerpt = md['raw_output_excerpt']
            if 'InvalidGeneratedSyntaxException' in excerpt:
                print("⚠️  ISSUE DETECTED: InvalidGeneratedSyntaxException still present")
else:
    print("No reports found")
