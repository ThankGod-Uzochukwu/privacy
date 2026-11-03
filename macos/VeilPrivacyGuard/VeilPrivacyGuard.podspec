require 'json'

Pod::Spec.new do |s|
  s.name         = 'VeilPrivacyGuard'
  s.version      = '1.0.0'
  s.summary      = 'Veil native privacy module for macOS (capture exclusion, shortcut blocking, cover windows).'
  s.homepage     = 'https://github.com/veil-app/veil'
  s.license      = { :type => 'MIT' }
  s.authors      = { 'Veil' => 'dev@veil.app' }
  s.platforms    = { :osx => '14.0' }
  s.source       = { :path => '.' }
  s.source_files = '*.{h,m}'
  s.frameworks   = 'Cocoa', 'Carbon', 'ApplicationServices', 'QuartzCore'
  s.requires_arc = true

  s.dependency 'React-Core'
end
