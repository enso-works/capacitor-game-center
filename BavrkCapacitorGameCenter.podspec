require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'BavrkCapacitorGameCenter'
  s.version = package['version']
  s.summary = package['description']
  s.license = package['license']
  s.homepage = 'https://github.com/enso-works/capacitor-game-center'
  s.author = package['author']
  s.source = { :git => 'https://github.com/enso-works/capacitor-game-center.git', :tag => 'v' + package['version'] }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.frameworks = 'GameKit'
  s.dependency 'Capacitor'
  s.swift_version = '5.9'
end
