import Link from 'next/link'

const menuItems = [
  {
    category: '기본',
    items: [
      { name: '대시보드', path: '/dashboard', icon: '📊' },
      { name: '신청하기', path: '/dashboard/apply', icon: '📝' },
      { name: '신청내역', path: '/dashboard/history', icon: '📋' },
    ],
  },
  {
    category: '관리',
    items: [
      { name: '사용자 관리', path: '/dashboard/users', icon: '👥' },
      { name: '설정', path: '/dashboard/settings', icon: '⚙️' },
    ],
  },
  {
    category: '보안',
    items: [
      { name: '보고서', path: '/dashboard/security-report', icon: '🛡️' },
    ]
  }
]

export default function Sidebar() {
  return (
    <div className="w-64 h-screen bg-gray-800 text-white flex flex-col">
      <div className="p-6 text-2xl font-bold border-b border-gray-700">LOFA</div>
      <nav className="flex-1 p-4 space-y-6">
        {menuItems.map((menu, index) => (
          <div key={index}>
            <h3 className="px-4 mb-2 text-xs font-bold tracking-wider text-gray-400 uppercase">{menu.category}</h3>
            <ul>
              {menu.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Link 
                    href={item.path}
                    className="flex items-center px-4 py-2 text-sm rounded-lg hover:bg-gray-700 transition-colors duration-200"
                  >
                    <span className="mr-3 text-lg">{item.icon}</span>
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
